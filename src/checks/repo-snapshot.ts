import { parse as parseToml } from "smol-toml";
import { endOfQuoted, type SourceFile } from "./source-file";

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
  readonly openNextVersionRange: string | null;
  readonly runtimeDependencies: readonly string[];
  readonly wrangler: WranglerConfig | null;
  readonly nextConfig: SourceFile | null;
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
  if (!Object.hasOwn(allDependencies, "next")) {
    throw new RepoNotScannableError(
      'Expected a Next.js app, but package.json has no "next" dependency.'
    );
  }
  return {
    adapter: detectAdapter(allDependencies),
    openNextVersionRange: allDependencies[OPENNEXT_PACKAGE] ?? null,
    runtimeDependencies: Object.keys(manifest.dependencies),
    wrangler: readWranglerConfig(files),
    nextConfig: firstExisting(files, NEXT_CONFIG_PATHS),
    openNextConfig: firstExisting(files, OPENNEXT_CONFIG_PATHS),
    serverFiles: selectServerFiles(files)
  };
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
      : JSON.parse(stripJsoncSyntax(file.text))
  );
  if (!isRecord(config)) {
    throw new RepoNotScannableError(
      `Expected ${file.path} to contain an object.`
    );
  }
  const date = config.compatibility_date;
  const durableObjects = isRecord(config.durable_objects)
    ? config.durable_objects.bindings
    : undefined;
  return {
    file,
    compatibilityDate:
      typeof date === "string" && ISO_DATE.test(date) ? date : null,
    compatibilityFlags: stringArray(config.compatibility_flags),
    durableObjectClasses: namesIn(durableObjects, "class_name"),
    migratedClasses: recordsIn(config.migrations).flatMap((migration) => [
      ...stringArray(migration.new_classes),
      ...stringArray(migration.new_sqlite_classes)
    ]),
    r2Bindings: namesIn(config.r2_buckets, "binding"),
    d1Bindings: namesIn(config.d1_databases, "binding"),
    serviceBindings: namesIn(config.services, "binding")
  };
}

function selectServerFiles(files: ReadonlyMap<string, string>): SourceFile[] {
  const serverFiles: SourceFile[] = [];
  for (const [path, text] of files) {
    const isClientModule = USE_CLIENT_DIRECTIVE.test(
      text.slice(0, DIRECTIVE_SEARCH_CHARS)
    );
    if (CODE_FILE.test(path) && !NON_APP_PATH.test(path) && !isClientModule) {
      serverFiles.push({ path, text });
    }
  }
  return serverFiles;
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
 * Removes comments and trailing commas so JSON.parse accepts JSONC. One pass, O(n).
 * Strings are copied untouched, so "https://…" inside a value is not read as a comment.
 * A comma is held back until the next significant character shows whether it trails.
 */
function stripJsoncSyntax(text: string): string {
  let output = "";
  let pendingComma = false;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "/" && next === "/") {
      const newline = text.indexOf("\n", index);
      index = newline === -1 ? text.length : newline;
    } else if (char === "/" && next === "*") {
      const close = text.indexOf("*/", index + 2);
      index = close === -1 ? text.length : close + 2;
    } else if (char === ",") {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
