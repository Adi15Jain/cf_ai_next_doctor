import { parse as parseToml } from "smol-toml";
import { isRecord } from "../json-guards";
import { endOfQuoted, withoutComments, type SourceFile } from "./source-file";

/** Which Cloudflare adapter the app uses; decides which rules apply. */
export type Adapter = "vinext" | "opennext" | "next-on-pages" | "none";

/** The parts of a Wrangler config the checks read, with types validated. */
export type WranglerConfig = {
  readonly file: SourceFile;
  readonly compatibilityDate: string | null;
  readonly compatibilityFlags: readonly string[];
  readonly durableObjectClasses: readonly string[];
  readonly migratedClasses: readonly string[];
  readonly r2Bindings: readonly string[];
  readonly d1Bindings: readonly string[];
  readonly serviceBindings: readonly string[];
};

/** Everything the checks need, parsed and validated once at the boundary. */
export type RepoSnapshot = {
  readonly adapter: Adapter;
  readonly nextVersionRange: string;
  readonly openNextVersionRange: string | null;
  readonly runtimeDependencies: readonly string[];
  readonly wrangler: WranglerConfig | null;
  /** Comments blanked out (line numbers kept), so commented-out code never counts. */
  readonly nextConfig: SourceFile | null;
  /** Comments blanked out (line numbers kept), so commented-out code never counts. */
  readonly openNextConfig: SourceFile | null;
  /** Server-side code only: no dependencies, build output, tests, config or "use client" modules. */
  readonly serverFiles: readonly SourceFile[];
};

/** The input is not a Next.js app this tool can scan; the message says why. */
export class RepoNotScannableError extends Error {
  name = "RepoNotScannableError";
}

type PackageManifest = {
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
};

// Highest precedence first: a repo mid-migration still lists the adapter it is leaving.
const ADAPTER_PACKAGES: readonly (readonly [
  Exclude<Adapter, "none">,
  string
])[] = [
  ["vinext", "vinext"],
  ["opennext", "@opennextjs/cloudflare"],
  ["next-on-pages", "@cloudflare/next-on-pages"]
];
const OPENNEXT_PACKAGE = "@opennextjs/cloudflare";
// Same lookup order as Wrangler's own findWranglerConfig().
const WRANGLER_CONFIG_PATHS = [
  "wrangler.json",
  "wrangler.jsonc",
  "wrangler.toml"
];
const NEXT_CONFIG_PATHS = [
  "next.config.ts",
  "next.config.mjs",
  "next.config.js",
  "next.config.cjs"
];
const OPENNEXT_CONFIG_PATHS = [
  "open-next.config.ts",
  "open-next.config.mjs",
  "open-next.config.js"
];
const CONFIG_PATHS = new Set([
  "package.json",
  ...WRANGLER_CONFIG_PATHS,
  ...NEXT_CONFIG_PATHS,
  ...OPENNEXT_CONFIG_PATHS
]);
const CODE_FILE = /\.[cm]?[jt]sx?$/;
const NON_APP_PATH =
  /(?:^|\/)(?:node_modules|\.next|\.open-next|\.vercel|\.wrangler|dist|build|out|coverage|public|scripts|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|\.d\.ts$|^[^/]+\.config\.[cm]?[jt]s$/;
const USE_CLIENT_DIRECTIVE =
  /^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*["']use client["']/;
const DIRECTIVE_SEARCH_CHARS = 500;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a repository's files (repo-relative path → text) into a RepoSnapshot.
 * Throws RepoNotScannableError when there is no Next.js app or a config file is unreadable.
 */
export function readRepoSnapshot(
  files: ReadonlyMap<string, string>
): RepoSnapshot {
  const manifest = readPackageManifest(files.get("package.json"));
  const allDependencies = {
    ...manifest.devDependencies,
    ...manifest.dependencies
  };
  const nextVersionRange = Object.hasOwn(allDependencies, "next")
    ? allDependencies.next
    : undefined;
  if (nextVersionRange === undefined) {
    throw new RepoNotScannableError(
      'Expected a Next.js app, but package.json has no "next" dependency.'
    );
  }
  return {
    adapter: detectAdapter(allDependencies),
    nextVersionRange,
    openNextVersionRange: allDependencies[OPENNEXT_PACKAGE] ?? null,
    runtimeDependencies: Object.keys(manifest.dependencies),
    wrangler: readWranglerConfig(files),
    nextConfig: codeOnly(firstExisting(files, NEXT_CONFIG_PATHS)),
    openNextConfig: codeOnly(firstExisting(files, OPENNEXT_CONFIG_PATHS)),
    serverFiles: selectServerFiles(files)
  };
}

/** True for the files readRepoSnapshot reads (root configs and app code), so downloads can skip the rest. */
export function isScannablePath(path: string): boolean {
  return CONFIG_PATHS.has(path) || isAppCodePath(path);
}

function isAppCodePath(path: string): boolean {
  return CODE_FILE.test(path) && !NON_APP_PATH.test(path);
}

function readPackageManifest(text: string | undefined): PackageManifest {
  if (text === undefined) {
    throw new RepoNotScannableError(
      "Expected package.json at the repository root, but found none."
    );
  }
  const manifest = parseOrExplain("package.json", () => JSON.parse(text));
  if (!isRecord(manifest)) {
    throw new RepoNotScannableError(
      "Expected package.json to contain a JSON object."
    );
  }
  return {
    dependencies: stringRecord(manifest.dependencies),
    devDependencies: stringRecord(manifest.devDependencies)
  };
}

function detectAdapter(dependencies: Record<string, string>): Adapter {
  const match = ADAPTER_PACKAGES.find(([, packageName]) =>
    Object.hasOwn(dependencies, packageName)
  );
  return match ? match[0] : "none";
}

function readWranglerConfig(
  files: ReadonlyMap<string, string>
): WranglerConfig | null {
  const file = firstExisting(files, WRANGLER_CONFIG_PATHS);
  if (file === null) return null;
  const config = parseOrExplain(file.path, () =>
    file.path.endsWith(".toml")
      ? parseToml(file.text)
      : JSON.parse(removeTrailingCommas(withoutComments(file.text)))
  );
  if (!isRecord(config)) {
    throw new RepoNotScannableError(
      `Expected ${file.path} to contain an object.`
    );
  }
  const date = config.compatibility_date;
  // `env.<name>` sections do not inherit bindings, so one declared in any section counts.
  // Migrations are unioned the same way, which can only remove false alarms.
  const sections = [
    config,
    ...recordsIn(isRecord(config.env) ? Object.values(config.env) : [])
  ];
  const across = (read: (section: Record<string, unknown>) => string[]) =>
    sections.flatMap(read);
  return {
    file,
    compatibilityDate:
      typeof date === "string" && ISO_DATE.test(date) ? date : null,
    compatibilityFlags: stringArray(config.compatibility_flags),
    durableObjectClasses: across((section) =>
      namesIn(
        isRecord(section.durable_objects)
          ? section.durable_objects.bindings
          : undefined,
        "class_name"
      )
    ),
    migratedClasses: across((section) =>
      recordsIn(section.migrations).flatMap((migration) => [
        ...stringArray(migration.new_classes),
        ...stringArray(migration.new_sqlite_classes)
      ])
    ),
    r2Bindings: across((section) => namesIn(section.r2_buckets, "binding")),
    d1Bindings: across((section) => namesIn(section.d1_databases, "binding")),
    serviceBindings: across((section) => namesIn(section.services, "binding"))
  };
}

function selectServerFiles(files: ReadonlyMap<string, string>): SourceFile[] {
  const serverFiles: SourceFile[] = [];
  for (const [path, text] of files) {
    const isClientModule = USE_CLIENT_DIRECTIVE.test(
      text.slice(0, DIRECTIVE_SEARCH_CHARS)
    );
    if (isAppCodePath(path) && !isClientModule) {
      serverFiles.push({ path, text });
    }
  }
  return serverFiles;
}

function codeOnly(file: SourceFile | null): SourceFile | null {
  return file === null
    ? null
    : { path: file.path, text: withoutComments(file.text) };
}

function firstExisting(
  files: ReadonlyMap<string, string>,
  paths: readonly string[]
): SourceFile | null {
  const path = paths.find((candidate) => files.has(candidate));
  return path === undefined ? null : { path, text: files.get(path) ?? "" };
}

function parseOrExplain(path: string, parse: () => unknown): unknown {
  try {
    return parse();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new RepoNotScannableError(
      `Expected ${path} to be parseable, but: ${reason}`
    );
  }
}

/**
 * Removes trailing commas (`[1, 2,]`) so JSON.parse accepts JSONC once comments are gone.
 * One pass, O(n); strings are copied untouched. A comma is held back until the next
 * significant character shows whether it trails.
 */
function removeTrailingCommas(text: string): string {
  let output = "";
  let pendingComma = false;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === ",") {
      if (pendingComma) output += ",";
      pendingComma = true;
      index += 1;
    } else if (/\s/.test(char)) {
      output += char;
      index += 1;
    } else {
      if (pendingComma && char !== "}" && char !== "]") output += ",";
      pendingComma = false;
      const end = char === '"' ? endOfQuoted(text, index, false) : index + 1;
      output += text.slice(index, end);
      index = end;
    }
  }
  return pendingComma ? `${output},` : output;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function recordsIn(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function namesIn(value: unknown, key: string): string[] {
  return recordsIn(value).flatMap((item) => {
    const name = item[key];
    return typeof name === "string" ? [name] : [];
  });
}
