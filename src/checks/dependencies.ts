import semver from "semver";
import type { OpenNextRelease } from "../npm/opennext-release";
import type { Finding } from "./finding";
import type { RepoSnapshot } from "./repo-snapshot";

const NATIVE_ADDON_PACKAGES = new Set([
  "sharp",
  "bcrypt",
  "better-sqlite3",
  "sqlite3",
  "argon2",
  "canvas",
  "@napi-rs/canvas"
]);
const PROXY_ENTRY_PATHS = new Set([
  "proxy.ts",
  "proxy.js",
  "src/proxy.ts",
  "src/proxy.js"
]);
// PR #1309, released in @opennextjs/cloudflare 1.20.3 on 2026-08-26.
const PROXY_SUPPORTED_SINCE_VERSION = "1.20.3";

/** Native (.node) addons cannot load on Workers; only runtime dependencies are bundled. */
export function checkNativeAddons(snapshot: RepoSnapshot): Finding[] {
  return snapshot.runtimeDependencies
    .filter((dependency) => NATIVE_ADDON_PACKAGES.has(dependency))
    .map(
      (dependency): Finding => ({
        failureId: "native-addon-dependency",
        severity: "warning",
        file: "package.json",
        line: null,
        evidence: `${dependency} is in dependencies`
      })
    );
}

/** proxy.ts on OpenNext needs adapter 1.20.3+; warns when package.json allows older. */
export function checkProxyAdapterVersion(snapshot: RepoSnapshot): Finding[] {
  const range = snapshot.openNextVersionRange;
  const proxyFile = snapshot.serverFiles.find((file) =>
    PROXY_ENTRY_PATHS.has(file.path)
  );
  const lowest = lowestVersionIn(range);
  if (snapshot.adapter !== "opennext" || !proxyFile || lowest === null)
    return [];
  if (!semver.lt(lowest, PROXY_SUPPORTED_SINCE_VERSION)) return [];
  return [
    {
      failureId: "proxy-needs-newer-adapter",
      severity: "warning",
      file: proxyFile.path,
      line: null,
      evidence: `${proxyFile.path} exists and package.json allows @opennextjs/cloudflare ${range}`
    }
  ];
}

/**
 * Compares the declared `next` range with the Next.js range of each adapter release that
 * package.json allows (`openNextReleases`, newest first, from the npm registry; empty: skip).
 * Error: no allowed release supports it. Warning: only older ones do, so the lockfile is
 * probably pinned and upgrading the adapter alone will break the app.
 */
export function checkNextVersionSupported(
  snapshot: RepoSnapshot,
  openNextReleases: readonly OpenNextRelease[]
): Finding[] {
  const declared = snapshot.nextVersionRange;
  const [newest] = openNextReleases;
  if (
    snapshot.adapter !== "opennext" ||
    newest === undefined ||
    semver.validRange(declared) === null
  ) {
    return [];
  }
  // A release with no `next` peer declares no restriction, so it supports any version.
  const supportsDeclared = ({ supportedNextRange }: OpenNextRelease) =>
    supportedNextRange === null ||
    (semver.validRange(supportedNextRange) !== null &&
      semver.intersects(declared, supportedNextRange));
  if (supportsDeclared(newest)) return [];

  const newestCompatible = openNextReleases.find(supportsDeclared);
  const newestFacts = `@opennextjs/cloudflare ${newest.version}, the newest release package.json allows, supports next ${newest.supportedNextRange}`;
  return [
    {
      failureId: "next-version-unsupported",
      severity: newestCompatible ? "warning" : "error",
      file: "package.json",
      line: null,
      evidence: newestCompatible
        ? `next ${declared} works only up to @opennextjs/cloudflare ${newestCompatible.version}; ${newestFacts}`
        : `no @opennextjs/cloudflare release that package.json allows supports next ${declared}; ${newestFacts}`
    }
  ];
}

// The lowest version a range admits ("^1.19.0" → "1.19.0"); null for "latest", "workspace:*" etc.
function lowestVersionIn(range: string | null): string | null {
  if (range === null || semver.validRange(range) === null) return null;
  return semver.minVersion(range)?.version ?? null;
}
