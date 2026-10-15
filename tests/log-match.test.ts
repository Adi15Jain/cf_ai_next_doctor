import { describe, expect, it } from "vitest";
import { matchErrorLog } from "../src/log-match";

describe("matchErrorLog", () => {
  it("recognises a known runtime error and quotes the matching line", () => {
    const log =
      "GET /blog 500\n  FatalError: Dummy queue is not implemented\n    at revalidate (x.js:1)";
    expect(matchErrorLog(log)).toEqual([
      {
        failureId: "isr-queue-missing",
        line: "FatalError: Dummy queue is not implemented"
      }
    ]);
  });

  it("recognises several failures in one log, once each", () => {
    const log = [
      '✘ [ERROR] Could not resolve "postgres"',
      "Error: Cannot perform I/O on behalf of a different request.",
      "Error: Cannot perform I/O on behalf of a different request."
    ].join("\n");
    expect(matchErrorLog(log).map((match) => match.failureId)).toEqual([
      "module-scope-io",
      "workerd-package-bundled"
    ]);
  });

  it("returns nothing for an unrelated log", () => {
    expect(matchErrorLog("Compiled successfully in 4.2s")).toEqual([]);
  });
});
