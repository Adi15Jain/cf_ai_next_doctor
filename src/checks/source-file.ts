/** A text file from the scanned repository, addressed by its repo-relative path. */
export type SourceFile = { readonly path: string; readonly text: string };

export type LineMatch = { readonly line: number; readonly text: string };

/**
 * Every line of `file` matching `pattern`, with 1-based line numbers. O(file length).
 * `pattern` must not use the `g` flag: `test()` on a global regex is stateful.
 */
export function matchingLines(file: SourceFile, pattern: RegExp): LineMatch[] {
  return file.text
    .split("\n")
    .flatMap((text, index) =>
      pattern.test(text) ? [{ line: index + 1, text: text.trim() }] : []
    );
}

/** 1-based line of the first match of `pattern` (non-global), or null when nothing matches. */
export function firstLineMatching(
  file: SourceFile,
  pattern: RegExp
): number | null {
  const index = file.text.split("\n").findIndex((text) => pattern.test(text));
  return index === -1 ? null : index + 1;
}

/**
 * `text` with `//` and `/* *\/` comments blanked to spaces. Newlines are kept, so line
 * numbers still match the original. String-aware: "https://…" in quotes survives. O(n).
 */
export function withoutComments(text: string): string {
  let output = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    let end = index + 1;
    if (char === '"' || char === "'" || char === "`") {
      end = endOfQuoted(text, index, char !== "`");
    } else if (char === "/" && next === "/") {
      const newline = text.indexOf("\n", index);
      end = newline === -1 ? text.length : newline;
    } else if (char === "/" && next === "*") {
      const close = text.indexOf("*/", index + 2);
      end = close === -1 ? text.length : close + 2;
    }
    const chunk = text.slice(index, end);
    output +=
      char === "/" && end > index + 1 ? chunk.replace(/[^\n]/g, " ") : chunk;
    index = end;
  }
  return output;
}

/**
 * Index just past the string literal that opens at `start`, honouring backslash escapes.
 * With `stopAtNewline`, an unterminated '…' or "…" ends at the newline, which limits the
 * damage when a quote inside a regex literal is mistaken for the start of a string.
 */
export function endOfQuoted(
  text: string,
  start: number,
  stopAtNewline: boolean
): number {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    if (stopAtNewline && char === "\n") return index;
    index += 1;
  }
  return text.length;
}
