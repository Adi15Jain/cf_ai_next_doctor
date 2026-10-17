import { describe, expect, it } from "vitest";
import {
  readScanMessageMetadata,
  readScanStage
} from "../src/scan/scan-status";

describe("readScanStage", () => {
  it("reads a known stage from a progress report", () => {
    expect(readScanStage({ stage: "explaining" })).toBe("explaining");
  });

  it("returns null for anything else", () => {
    expect(readScanStage({ stage: "deploying" })).toBeNull();
    expect(readScanStage("explaining")).toBeNull();
    expect(readScanStage(null)).toBeNull();
  });
});

describe("readScanMessageMetadata", () => {
  it("reads report metadata", () => {
    const metadata = {
      kind: "scan-report",
      repoUrl: "https://github.com/acme/shop",
      errorCount: 1,
      warningCount: 2
    };
    expect(readScanMessageMetadata(metadata)).toEqual(metadata);
  });

  it("reads failure metadata", () => {
    expect(
      readScanMessageMetadata({ kind: "scan-failed", repoUrl: "x" })
    ).toEqual({ kind: "scan-failed", repoUrl: "x" });
  });

  it("returns null for ordinary messages and for reports missing their counts", () => {
    expect(readScanMessageMetadata(undefined)).toBeNull();
    expect(
      readScanMessageMetadata({ kind: "scan-report", repoUrl: "x" })
    ).toBeNull();
  });
});
