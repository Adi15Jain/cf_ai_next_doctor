import { isRecord } from "../json-guards";

/** Where a running scan is. The Workflow reports each change and the UI shows it. */
export type ScanStage = "scanning" | "explaining" | "posting";

/** A scan that has started and not yet posted its report; part of the state every tab sees. */
export type ActiveScan = {
  readonly scanId: string;
  readonly repoUrl: string;
  readonly stage: ScanStage;
};

/** Attached to the chat messages a scan posts, so the UI can draw them as report cards. */
export type ScanMessageMetadata =
  | {
      readonly kind: "scan-report";
      readonly repoUrl: string;
      readonly errorCount: number;
      readonly warningCount: number;
    }
  | { readonly kind: "scan-failed"; readonly repoUrl: string };

const SCAN_STAGES: readonly ScanStage[] = ["scanning", "explaining", "posting"];

/** The stage in a Workflow progress report, or null when the report carries none. */
export function readScanStage(progress: unknown): ScanStage | null {
  if (!isRecord(progress)) return null;
  return SCAN_STAGES.find((stage) => stage === progress.stage) ?? null;
}

/** A message's metadata as scan metadata, or null for an ordinary chat message. */
export function readScanMessageMetadata(
  metadata: unknown
): ScanMessageMetadata | null {
  if (!isRecord(metadata) || typeof metadata.repoUrl !== "string") return null;
  const { kind, repoUrl, errorCount, warningCount } = metadata;
  if (kind === "scan-failed") return { kind, repoUrl };
  if (
    kind === "scan-report" &&
    typeof errorCount === "number" &&
    typeof warningCount === "number"
  ) {
    return { kind, repoUrl, errorCount, warningCount };
  }
  return null;
}
