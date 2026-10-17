import { describe, expect, it } from "vitest";
import { countBySeverity, type Finding } from "../src/checks/finding";

function finding(severity: Finding["severity"]): Finding {
  return {
    failureId: "edge-runtime-declared",
    severity,
    file: null,
    line: null,
    evidence: ""
  };
}

describe("countBySeverity", () => {
  it("counts errors and warnings separately", () => {
    expect(
      countBySeverity([
        finding("error"),
        finding("warning"),
        finding("warning")
      ])
    ).toEqual({ errors: 1, warnings: 2 });
  });

  it("counts nothing for no findings", () => {
    expect(countBySeverity([])).toEqual({ errors: 0, warnings: 0 });
  });
});
