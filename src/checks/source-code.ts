import type { Finding } from "./finding";
import type { RepoSnapshot } from "./repo-snapshot";
import {
  endOfQuoted,
  matchingLines,
  type LineMatch,
  type SourceFile
} from "./source-file";

// Anchored so a commented-out `// export const runtime = "edge"` is not reported.
const EDGE_RUNTIME_EXPORT = /^\s*export\s+const\s+runtime\s*=\s*["']edge["']/;
const IO_CLIENT_CREATION =
  /\bnew (?:PrismaClient|Pool|Redis|MongoClient)\(|\bpostgres\(|\bmongoose\.connect\(|\bawait fetch\(/;
const SYNC_CLOUDFLARE_CONTEXT_CALL = /\bgetCloudflareContext\(\s*\)/;
// A call on a line that also defines a function runs later, inside a request, not at load.
const DEFERRED_BY_FUNCTION = /=>|\bfunction\b/;
const COMMENT_LINE = /^(?:\/\/|\/\*|\*)/;

/** Flags `export const runtime = "edge"`; an error on OpenNext, a migration warning elsewhere. */
export function checkEdgeRuntime(snapshot: RepoSnapshot): Finding[] {
  const severity = snapshot.adapter === "opennext" ? "error" : "warning";
  return snapshot.serverFiles.flatMap((file) =>
    matchingLines(file, EDGE_RUNTIME_EXPORT).map(
      (match): Finding => ({
        failureId: "edge-runtime-declared",
        severity,
        file: file.path,
        line: match.line,
        evidence: match.text
      })
    )
  );
}

/** Flags database clients and awaited fetches created at module scope. */
export function checkModuleScopeIo(snapshot: RepoSnapshot): Finding[] {
  return snapshot.serverFiles.flatMap((file) =>
    moduleScopeMatches(file, IO_CLIENT_CREATION).map(
      (match): Finding => ({
        failureId: "module-scope-io",
        severity: "warning",
        file: file.path,
        line: match.line,
        evidence: match.text
      })
    )
  );
}

/** Flags synchronous `getCloudflareContext()` at module scope, before any request exists. */
export function checkModuleScopeCloudflareContext(
  snapshot: RepoSnapshot
): Finding[] {
  return snapshot.serverFiles.flatMap((file) =>
    moduleScopeMatches(file, SYNC_CLOUDFLARE_CONTEXT_CALL).map(
      (match): Finding => ({
        failureId: "cloudflare-context-at-module-scope",
        severity: "warning",
        file: file.path,
        line: match.line,
        evidence: match.text
      })
    )
  );
}

function moduleScopeMatches(file: SourceFile, pattern: RegExp): LineMatch[] {
  const moduleScope = moduleScopeLineNumbers(file.text);
  return matchingLines(file, pattern).filter(
    (match) =>
      moduleScope.has(match.line) &&
      !COMMENT_LINE.test(match.text) &&
      !DEFERRED_BY_FUNCTION.test(match.text)
  );
}

/**
 * 1-based numbers of the lines that begin outside every `{ }` block, i.e. at module scope.
 * One pass, O(n); braces inside strings, template literals and comments are skipped.
 * A heuristic, not a parser: a multi-line arrow function body without braces still reads
 * as module scope, which is why these findings are warnings.
 */
function moduleScopeLineNumbers(text: string): Set<number> {
  const moduleScope = new Set<number>([1]);
  let depth = 0;
  let line = 1;
  let index = 0;
  while (index < text.length) {
    const skipTo = endOfStringOrComment(text, index);
    if (skipTo !== null) {
      line += countNewlines(text, index, skipTo);
      index = skipTo;
      continue;
    }
    const char = text[index];
    if (char === "{") depth += 1;
    else if (char === "}") depth = Math.max(0, depth - 1);
    else if (char === "\n") {
      line += 1;
      if (depth === 0) moduleScope.add(line);
    }
    index += 1;
  }
  return moduleScope;
}

// Line comments stop before their newline so the main loop still counts it.
function endOfStringOrComment(text: string, start: number): number | null {
  const char = text[start];
  const next = text[start + 1];
  if (char === "/" && next === "/") {
    const newline = text.indexOf("\n", start);
    return newline === -1 ? text.length : newline;
  }
  if (char === "/" && next === "*") {
    const close = text.indexOf("*/", start + 2);
    return close === -1 ? text.length : close + 2;
  }
  if (char === '"' || char === "'") return endOfQuoted(text, start, true);
  if (char === "`") return endOfQuoted(text, start, false);
  return null;
}

function countNewlines(text: string, from: number, to: number): number {
  let count = 0;
  for (let index = from; index < to; index += 1) {
    if (text[index] === "\n") count += 1;
  }
  return count;
}
