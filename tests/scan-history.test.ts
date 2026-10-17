import { describe, expect, it } from "vitest";
import type { Finding } from "../src/checks/finding";
import { ScanHistory } from "../src/scan/scan-history";
import type { ScanReport } from "../src/scan/scan-repository";
import { inMemorySql } from "./sqlite";

const SHOP = "https://github.com/acme/shop";
const BLOG = "https://github.com/acme/blog";

function finding(
  failureId: Finding["failureId"],
  severity: Finding["severity"]
): Finding {
  return { failureId, severity, file: null, line: null, evidence: "" };
}

function report(repoUrl: string, findings: readonly Finding[]): ScanReport {
  return {
    repoUrl,
    commitSha: "4ea6a72cbabe2b62a6629a0c4d6d93e2f7a1c0de",
    adapter: "opennext",
    findings,
    versionCheckSkipped: null
  };
}

describe("ScanHistory", () => {
  it("returns saved scans newest first, with counts and distinct failure ids", () => {
    const history = new ScanHistory(inMemorySql());
    history.save("scan-1", report(SHOP, []), new Date("2026-10-16T10:00:00Z"));
    history.save(
      "scan-2",
      report(SHOP, [
        finding("edge-runtime-declared", "error"),
        finding("edge-runtime-declared", "error"),
        finding("native-addon-dependency", "warning")
      ]),
      new Date("2026-10-17T10:00:00Z")
    );
    expect(history.recent(10, null)).toEqual([
      {
        scanId: "scan-2",
        repoUrl: SHOP,
        commitSha: "4ea6a72cbabe2b62a6629a0c4d6d93e2f7a1c0de",
        adapter: "opennext",
        errorCount: 2,
        warningCount: 1,
        failureIds: ["edge-runtime-declared", "native-addon-dependency"],
        scannedAt: "2026-10-17T10:00:00.000Z"
      },
      expect.objectContaining({ scanId: "scan-1", failureIds: [] })
    ]);
  });

  it("replaces a scan saved twice, as a retried workflow step does", () => {
    const history = new ScanHistory(inMemorySql());
    history.save("scan-1", report(SHOP, []), new Date("2026-10-17T10:00:00Z"));
    history.save("scan-1", report(SHOP, []), new Date("2026-10-17T10:00:05Z"));
    expect(history.recent(10, null)).toHaveLength(1);
  });

  it("filters by repository and respects the limit", () => {
    const history = new ScanHistory(inMemorySql());
    history.save("scan-1", report(SHOP, []), new Date("2026-10-15T10:00:00Z"));
    history.save("scan-2", report(BLOG, []), new Date("2026-10-16T10:00:00Z"));
    history.save("scan-3", report(SHOP, []), new Date("2026-10-17T10:00:00Z"));
    expect(history.recent(10, SHOP).map((scan) => scan.scanId)).toEqual([
      "scan-3",
      "scan-1"
    ]);
    expect(history.recent(1, null).map((scan) => scan.scanId)).toEqual([
      "scan-3"
    ]);
  });

  it("names the column when a stored row does not match the schema", () => {
    const row = {
      scan_id: 42,
      repo_url: SHOP,
      commit_sha: null,
      adapter: "opennext",
      error_count: 0,
      warning_count: 0,
      failure_ids: "",
      scanned_at: "2026-10-17T10:00:00.000Z"
    };
    const corrupt = { exec: () => ({ toArray: () => [row] }) };
    expect(() => new ScanHistory(corrupt).recent(10, null)).toThrow(
      "Expected scans.scan_id to be text, but found number."
    );
  });
});
