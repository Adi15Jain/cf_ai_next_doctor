import type { Finding } from "../checks/finding";
import { readRepoSnapshot, type Adapter } from "../checks/repo-snapshot";
import { runAllChecks } from "../checks/run-all";
import { fetchRepoFiles } from "../github/fetch-repo";
import { formatRepoUrl, parseRepoUrl } from "../github/repo-url";
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
  const location = parseRepoUrl(repoUrl);
  const { files, commitSha } = await fetchRepoFiles(location, fetchFunction);
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
