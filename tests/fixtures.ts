import {
  readRepoSnapshot,
  type RepoSnapshot
} from "../src/checks/repo-snapshot";

type Dependencies = Record<string, string>;

export const OPENNEXT_LATEST = { "@opennextjs/cloudflare": "^1.20.11" };

/** A package.json for a Next.js app; `next` is always present. */
export function packageJson(
  dependencies: Dependencies = {},
  devDependencies: Dependencies = {}
): string {
  return JSON.stringify({
    name: "fixture",
    dependencies: { next: "^16.3.8", ...dependencies },
    devDependencies
  });
}

export function snapshotOf(files: Record<string, string>): RepoSnapshot {
  return readRepoSnapshot(new Map(Object.entries(files)));
}

/** An OpenNext app with the latest adapter plus the given files and runtime dependencies. */
export function openNextApp(
  files: Record<string, string> = {},
  dependencies: Dependencies = {}
): RepoSnapshot {
  return snapshotOf({
    "package.json": packageJson({ ...OPENNEXT_LATEST, ...dependencies }),
    ...files
  });
}

/** A wrangler.jsonc built from a plain object. */
export function wranglerJsonc(config: Record<string, unknown>): string {
  return JSON.stringify(config, null, 2);
}
