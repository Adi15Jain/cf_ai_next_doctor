import { FAILURES, type FailureId } from "./knowledge/failures";

const MAX_QUOTED_LINE_CHARS = 300;

/** A known failure recognised in a pasted log, with the first line that matched. */
export type LogMatch = { readonly failureId: FailureId; readonly line: string };

/**
 * Finds knowledge-base failures whose error text appears in a build, deploy or runtime log.
 * Returns at most one match per failure, in knowledge-base order. O(lines × patterns).
 */
export function matchErrorLog(log: string): LogMatch[] {
  const lines = log.split(/\r?\n/);
  const failureIds = Object.keys(FAILURES) as FailureId[];
  return failureIds.flatMap((failureId): LogMatch[] => {
    const patterns: readonly RegExp[] = FAILURES[failureId].logPatterns;
    const line = lines.find((candidate) =>
      patterns.some((pattern) => pattern.test(candidate))
    );
    return line === undefined
      ? []
      : [{ failureId, line: line.trim().slice(0, MAX_QUOTED_LINE_CHARS) }];
  });
}
