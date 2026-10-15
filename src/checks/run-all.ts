import type { OpenNextRelease } from "../npm/opennext-release";
import { checkCacheBindings, checkIsrQueue } from "./opennext-cache";
import {
  checkNativeAddons,
  checkNextVersionSupported,
  checkProxyAdapterVersion
} from "./dependencies";
import type { Finding, Severity } from "./finding";
import { checkDevInit, checkWorkerdPackages } from "./next-config";
import type { RepoSnapshot } from "./repo-snapshot";
import {
  checkEdgeRuntime,
  checkModuleScopeCloudflareContext,
  checkModuleScopeIo
} from "./source-code";
import { checkNodejsCompat, checkWeakRefAvailability } from "./wrangler-config";

// Checks that only read the repository simply ignore the registry facts.
type Check = (
  snapshot: RepoSnapshot,
  openNextReleases: readonly OpenNextRelease[]
) => Finding[];

const CHECKS: readonly Check[] = [
  checkNodejsCompat,
  checkWeakRefAvailability,
  checkDevInit,
  checkWorkerdPackages,
  checkNativeAddons,
  checkProxyAdapterVersion,
  checkNextVersionSupported,
  checkEdgeRuntime,
  checkModuleScopeIo,
  checkModuleScopeCloudflareContext,
  checkIsrQueue,
  checkCacheBindings
];

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1 };

/**
 * Runs every check; errors first, then by file and line. O(total file size + k log k).
 * `openNextReleases` are the adapter releases package.json allows (from npm); empty skips the version check.
 */
export function runAllChecks(
  snapshot: RepoSnapshot,
  openNextReleases: readonly OpenNextRelease[]
): Finding[] {
  return CHECKS.flatMap((check) => check(snapshot, openNextReleases)).sort(
    compareFindings
  );
}

function compareFindings(left: Finding, right: Finding): number {
  return (
    SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
    (left.file ?? "").localeCompare(right.file ?? "") ||
    (left.line ?? 0) - (right.line ?? 0)
  );
}
