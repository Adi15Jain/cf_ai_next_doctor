import type { Finding } from "./finding";
import type { RepoSnapshot } from "./repo-snapshot";
import { withoutComments, type SourceFile } from "./source-file";

const DEV_INIT_CALL = /\binitOpenNextCloudflareForDev\s*\(/;
const CLOUDFLARE_CONTEXT_CALL = /\bgetCloudflareContext\s*\(/;
const SERVER_EXTERNAL_PACKAGES_ARRAY =
  /serverExternalPackages\s*:\s*\[([^\]]*)\]/;
const QUOTED_NAME = /["'`]([^"'`]+)["'`]/g;

// Package → names that must appear in serverExternalPackages. The package list is copied
// from the OpenNext workerd how-to (2026-10-15). A Map, not an object literal, so a
// dependency named "constructor" cannot hit Object.prototype.
const WORKERD_SPECIFIC_PACKAGES: ReadonlyMap<string, readonly string[]> =
  new Map([
    ["@libsql/isomorphic-ws", ["@libsql/isomorphic-ws"]],
    ["@prisma/client", ["@prisma/client", ".prisma/client"]],
    ["jose", ["jose"]],
    ["postgres", ["postgres"]],
    ["react-textarea-autosize", ["react-textarea-autosize"]]
  ]);

/**
 * OpenNext needs next.config to call initOpenNextCloudflareForDev() before code may call
 * getCloudflareContext(). Reported only when the app calls it, the failure issue #317 shows.
 */
export function checkDevInit(snapshot: RepoSnapshot): Finding[] {
  const config = snapshot.nextConfig;
  if (
    snapshot.adapter !== "opennext" ||
    (config && DEV_INIT_CALL.test(config.text))
  )
    return [];
  const caller = snapshot.serverFiles.find((file) =>
    CLOUDFLARE_CONTEXT_CALL.test(withoutComments(file.text))
  );
  if (!caller) return [];
  const gap = config
    ? `${config.path} never calls initOpenNextCloudflareForDev()`
    : "there is no next.config file";
  return [
    {
      failureId: "dev-init-missing",
      severity: "warning",
      file: config?.path ?? null,
      line: null,
      evidence: `${caller.path} calls getCloudflareContext(), but ${gap}`
    }
  ];
}

/** Packages with a workerd build must be listed in serverExternalPackages on OpenNext. */
export function checkWorkerdPackages(snapshot: RepoSnapshot): Finding[] {
  if (snapshot.adapter !== "opennext") return [];
  const externals = serverExternalPackages(snapshot.nextConfig);
  return snapshot.runtimeDependencies.flatMap((dependency): Finding[] => {
    const missing = (WORKERD_SPECIFIC_PACKAGES.get(dependency) ?? []).filter(
      (name) => !externals.has(name)
    );
    if (missing.length === 0) return [];
    return [
      {
        failureId: "workerd-package-bundled",
        severity: "warning",
        file: snapshot.nextConfig?.path ?? "package.json",
        line: null,
        evidence: `${dependency} is a dependency, but serverExternalPackages lacks ${missing.join(", ")}`
      }
    ];
  });
}

// Reads a literal array only; a variable or spread in next.config reads as empty.
function serverExternalPackages(config: SourceFile | null): Set<string> {
  const list = config
    ? SERVER_EXTERNAL_PACKAGES_ARRAY.exec(config.text)?.[1]
    : undefined;
  return new Set(
    list ? [...list.matchAll(QUOTED_NAME)].map((match) => match[1]) : []
  );
}
