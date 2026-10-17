import semver from "semver";
import { isRecord } from "../json-guards";

/** An @opennextjs/cloudflare release and the Next.js range it declares support for. */
export type OpenNextRelease = {
  readonly version: string;
  /** Null when the release declares no `next` peer (every release up to at least 1.6.5): no restriction. */
  readonly supportedNextRange: string | null;
};

/** The npm registry could not be read; the scan can continue without the version check. */
export class RegistryUnavailableError extends Error {
  name = "RegistryUnavailableError";
}

const REGISTRY_URL = "https://registry.npmjs.org/@opennextjs%2fcloudflare";
// The abbreviated ("corgi") document: ~230 KB with every version's peerDependencies,
// instead of several MB for the full one.
const ABBREVIATED_METADATA = "application/vnd.npm.install-v1+json";
const REGISTRY_TIMEOUT_MS = 10_000;

/**
 * Every @opennextjs/cloudflare release that `declaredRange` (from package.json) allows, newest
 * first, with its `next` peer range. Empty for non-semver ranges, without calling the registry.
 */
export async function fetchOpenNextReleases(
  declaredRange: string,
  fetchFunction: typeof fetch = fetch
): Promise<OpenNextRelease[]> {
  if (semver.validRange(declaredRange) === null) return [];
  const response = await fetchFunction(REGISTRY_URL, {
    headers: { accept: ABBREVIATED_METADATA },
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS)
  }).catch((error: unknown) => {
    throw new RegistryUnavailableError(
      `Expected to reach the npm registry, but: ${String(error)}`
    );
  });
  if (!response.ok) {
    throw new RegistryUnavailableError(
      `Expected npm registry metadata for @opennextjs/cloudflare, but got HTTP ${response.status}.`
    );
  }
  // satisfies() skips prereleases, as npm does when resolving a range.
  return [...readNextPeerRanges(await response.json())]
    .filter(([version]) => semver.satisfies(version, declaredRange))
    .map(([version, supportedNextRange]) => ({ version, supportedNextRange }))
    .sort((left, right) => semver.rcompare(left.version, right.version));
}

// Validates the registry document at the boundary: version → its `next` peer range, or null
// when the release declares none. Dropping those releases would turn "no restriction" into
// "supports nothing".
function readNextPeerRanges(document: unknown): Map<string, string | null> {
  const ranges = new Map<string, string | null>();
  const versions =
    isRecord(document) && isRecord(document.versions) ? document.versions : {};
  for (const [version, manifest] of Object.entries(versions)) {
    const peers = isRecord(manifest) ? manifest.peerDependencies : undefined;
    const nextRange = isRecord(peers) ? peers.next : undefined;
    ranges.set(version, typeof nextRange === "string" ? nextRange : null);
  }
  return ranges;
}
