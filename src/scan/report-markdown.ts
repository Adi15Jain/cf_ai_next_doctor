import type { Finding } from "../checks/finding";
import { redact } from "../guardrails";
import { ADAPTER_GUIDANCE } from "../knowledge/adapters";
import { FAILURES } from "../knowledge/failures";
import type { ScanReport } from "./scan-repository";

const SHORT_SHA_CHARS = 7;

/**
 * The scan report as chat Markdown. The findings are written from the report itself, before
 * the model's explanation, so the model can neither drop a finding nor invent one.
 */
export function formatReport(
  report: ScanReport,
  explanation: string | null
): string {
  const guidance = ADAPTER_GUIDANCE[report.adapter];
  const commit = report.commitSha
    ? `commit \`${report.commitSha.slice(0, SHORT_SHA_CHARS)}\``
    : "commit unknown";
  const sections = [
    `## Scan of ${report.repoUrl}`,
    `${commit} · adapter **${report.adapter}** · ${countSummary(report.findings)}`,
    `> ${guidance.advice} [Cloudflare docs](${guidance.docUrl})`
  ];
  if (report.versionCheckSkipped !== null) {
    sections.push(
      `_The Next.js version check was skipped: ${report.versionCheckSkipped}_`
    );
  }
  if (report.findings.length === 0) {
    sections.push(
      "No known problems found. Build and runtime failures can still happen; if a deploy fails, paste its error log here."
    );
    return sections.join("\n\n");
  }
  sections.push(
    "### Findings",
    report.findings.map(formatFinding).join("\n"),
    "### What to do first",
    explanation ??
      "_The AI explanation is unavailable right now. The findings above are complete._"
  );
  return sections.join("\n\n");
}

function formatFinding(finding: Finding, index: number): string {
  const entry = FAILURES[finding.failureId];
  const place = finding.file
    ? ` · \`${finding.file}${finding.line === null ? "" : `:${finding.line}`}\``
    : "";
  const severity = finding.severity === "error" ? "Error" : "Warning";
  // Double backticks let the evidence contain single backticks, as template literals do.
  return [
    `${index + 1}. **${severity}:** ${entry.title}${place}`,
    `   Found: \`\` ${redact(finding.evidence)} \`\``,
    `   Fix: ${entry.fix} [Docs](${entry.docUrl})`
  ].join("\n");
}

function countSummary(findings: readonly Finding[]): string {
  const errors = findings.filter((finding) => finding.severity === "error");
  const warnings = findings.length - errors.length;
  return `${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`;
}
