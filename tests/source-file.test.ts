import { describe, expect, it } from "vitest";
import { withoutComments } from "../src/checks/source-file";

describe("withoutComments", () => {
  it("blanks line and block comments but keeps every newline", () => {
    const text = "a; // one\n/* two\nthree */ b;\nc;";
    const blanked = withoutComments(text);
    expect(blanked.split("\n")).toHaveLength(text.split("\n").length);
    expect(blanked.replace(/\s+/g, " ").trim()).toBe("a; b; c;");
  });

  it("keeps comment-like text inside strings", () => {
    const text = `const url = "https://example.com"; const glob = '/*';`;
    expect(withoutComments(text)).toBe(text);
  });

  it("blanks an unterminated block comment to the end of the file", () => {
    expect(withoutComments("a; /* open\nb;")).toBe(`a; ${" ".repeat(7)}\n  `);
  });
});
