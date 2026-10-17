import type { Finding } from "../checks/finding";
import { runAllChecks } from "../checks/run-all";
import {
  readRepoSnapshot,
  RepoNotScannableError,
  type Adapter
} from "../checks/repo-snapshot";
import { fetchRepoFiles, type RepoFiles } from "../github/fetch-repo";
import {
  formatRepoUrl,
  parseRepoUrl,
  type RepoLocation
} from "../github/repo-url";
import { isRecord } from "../json-guards";
import {
  fetchOpenNextReleases,
  RegistryUnavailableError,
  type OpenNextRelease
} from "../npm/opennext-release";

/** What one scan found. Plain data, because it is a Workflow step result and a chat message. */
export type ScanReport = {
  /** Canonical form (see formatRepoUrl), so history lookups match however the URL was typed. */
  readonly repoUrl: string;
  readonly commitSha: string | null;
  readonly adapter: Adapter;
  /** Errors first; see runAllChecks. */
  readonly findings: readonly Finding[];
  /** Why the Next.js version check could not run; null when it ran or does not apply. */
  readonly versionCheckSkipped: string | null;
};

/**
 * Downloads a public GitHub repository and runs every check on it. Throws RepoNotScannableError
 * for input that will never scan (bad URL, private repository, not a Next.js app), so callers
 * know not to retry. An npm registry outage only skips the version check: the others still hold.
 */
export async function scanRepository(
  repoUrl: string,
  fetchFunction: typeof fetch = fetch
): Promise<ScanReport> {
  const { location, files, commitSha } = await fetchNextApp(
    parseRepoUrl(repoUrl),
    fetchFunction
  );
  const snapshot = readRepoSnapshot(files);

  let releases: OpenNextRelease[] = [];
  let versionCheckSkipped: string | null = null;
  if (
    snapshot.adapter === "opennext" &&
    snapshot.openNextVersionRange !== null
  ) {
    try {
      releases = await fetchOpenNextReleases(
        snapshot.openNextVersionRange,
        fetchFunction
      );
    } catch (error) {
      if (!(error instanceof RegistryUnavailableError)) throw error;
      versionCheckSkipped = error.message;
    }
  }

  return {
    repoUrl: formatRepoUrl(location),
    commitSha,
    adapter: snapshot.adapter,
    findings: runAllChecks(snapshot, releases),
    versionCheckSkipped
  };
}

/**
 * Downloads the repository and, when its root is not a Next.js app, finds the app folder:
 * one folder is scanned instead (a second download), several are listed for the user to
 * pick. A URL that already names a folder is taken as given.
 */
async function fetchNextApp(
  requested: RepoLocation,
  fetchFunction: typeof fetch
): Promise<RepoFiles & { readonly location: RepoLocation }> {
  const downloaded = await fetchRepoFiles(requested, fetchFunction);
  const rootManifest = downloaded.files.get("package.json");
  if (
    requested.subdirectory !== "" ||
    declaresNext(rootManifest, ["dependencies", "devDependencies"])
  ) {
    return { ...downloaded, location: requested };
  }
  // Libraries in a monorepo often list next as a dev or peer dependency; apps depend on it.
  const appFolders = [...downloaded.files]
    .filter(
      ([path, text]) =>
        path.endsWith("/package.json") && declaresNext(text, ["dependencies"])
    )
    .map(([path]) => path.slice(0, -"/package.json".length));
  const [onlyApp] = appFolders;
  if (onlyApp !== undefined && appFolders.length === 1) {
    const location = { ...requested, subdirectory: onlyApp };
    return { ...(await fetchRepoFiles(location, fetchFunction)), location };
  }
  if (appFolders.length > 1) {
    const urls = appFolders.map((folder) =>
      formatRepoUrl({ ...requested, subdirectory: folder })
    );
    throw new RepoNotScannableError(
      `Expected one Next.js app, but this repository has ${appFolders.length}. Scan one of: ${urls.join(", ")}`
    );
  }
  // With a root package.json, readRepoSnapshot says exactly what is wrong with it.
  if (rootManifest !== undefined) return { ...downloaded, location: requested };
  throw new RepoNotScannableError(
    'Expected a Next.js app, but no package.json in this repository depends on "next".'
  );
}

// An unparseable package.json is not the app the user asked about, so it reads as "no".
function declaresNext(
  manifestText: string | undefined,
  fields: readonly ("dependencies" | "devDependencies")[]
): boolean {
  if (manifestText === undefined) return false;
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return false;
  }
  return (
    isRecord(manifest) &&
    fields.some((field) => {
      const dependencies = manifest[field];
      return isRecord(dependencies) && Object.hasOwn(dependencies, "next");
    })
  );
}
