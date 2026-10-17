import type { FailureId } from "../knowledge/failures";

/** `error`: the deploy fails or requests crash. `warning`: likely to break, worth fixing. */
export type Severity = "error" | "warning";

/** One problem found in a repository, pointing at its knowledge-base entry. */
export type Finding = {
  readonly failureId: FailureId;
  readonly severity: Severity;
  readonly file: string | null;
  readonly line: number | null;
  readonly evidence: string;
};

/** How many findings are errors and how many are warnings. */
export function countBySeverity(findings: readonly Finding[]): {
  readonly errors: number;
  readonly warnings: number;
} {
  const errors = findings.filter(
    (finding) => finding.severity === "error"
  ).length;
  return { errors, warnings: findings.length - errors };
}
