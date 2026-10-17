import { describe, expect, it } from "vitest";
import type { Finding } from "../src/checks/finding";
import { formatReport } from "../src/scan/report-markdown";
import type { ScanReport } from "../src/scan/scan-repository";

const REPORT: ScanReport = {
  repoUrl: "https://github.com/acme/shop",
  commitSha: "4ea6a72cbabe2b62a6629a0c4d6d93e2f7a1c0de",
  adapter: "opennext",
  findings: [],
  versionCheckSkipped: null
};

const FINDINGS: readonly Finding[] = [
  {
    failureId: "edge-runtime-declared",
    severity: "error",
    file: "app/api/route.ts",
    line: 3,
    evidence: 'export const runtime = "edge"'
  },
  {
    failureId: "native-addon-dependency",
    severity: "warning",
    file: "package.json",
    line: null,
    evidence: "sharp is in dependencies"
  }
];

describe("formatReport", () => {
  it("says no known problems were found, with the adapter advice and its link", () => {
    const markdown = formatReport(REPORT, null);
    expect(markdown).toContain("## Scan of https://github.com/acme/shop");
    expect(markdown).toContain(
      "commit `4ea6a72` · adapter **opennext** · 0 errors, 0 warnings"
    );
    expect(markdown).toContain(
      "(https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)"
    );
    expect(markdown).toContain("No known problems found.");
    expect(markdown).not.toContain("### Findings");
  });

  it("lists every finding from the report, then the model's explanation", () => {
    const markdown = formatReport(
      { ...REPORT, findings: FINDINGS },
      "Remove the edge runtime first."
    );
    expect(markdown).toContain("1 error, 1 warning");
    expect(markdown).toContain(
      '1. **Error:** Route sets `export const runtime = "edge"` · `app/api/route.ts:3`'
    );
    expect(markdown).toContain("2. **Warning:**");
    expect(markdown).toContain("`package.json`");
    expect(markdown.indexOf("### Findings")).toBeLessThan(
      markdown.indexOf("Remove the edge runtime first.")
    );
  });

  it("says so when the explanation is unavailable", () => {
    expect(formatReport({ ...REPORT, findings: FINDINGS }, null)).toContain(
      "The AI explanation is unavailable right now."
    );
  });

  it("notes a skipped version check", () => {
    const markdown = formatReport(
      { ...REPORT, versionCheckSkipped: "registry returned HTTP 503" },
      null
    );
    expect(markdown).toContain(
      "_The Next.js version check was skipped: registry returned HTTP 503_"
    );
  });

  it("redacts secrets in quoted evidence", () => {
    const leaky: Finding = {
      failureId: "module-scope-io",
      severity: "warning",
      file: "lib/db.ts",
      line: 1,
      evidence: "new Pool({ password: 'hunter2hunter2' })"
    };
    expect(formatReport({ ...REPORT, findings: [leaky] }, null)).not.toContain(
      "hunter2"
    );
  });
});
