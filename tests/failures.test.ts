import { describe, expect, it } from "vitest";
import { FAILURES } from "../src/knowledge/failures";

const GITHUB_ISSUE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/;
const OFFICIAL_SOURCE =
  /^https:\/\/(?:developers\.cloudflare\.com|opennext\.js\.org|github\.com\/opennextjs)\//;

describe("knowledge base", () => {
  it.each(Object.entries(FAILURES))(
    "%s cites an official source and GitHub issues",
    (_, entry) => {
      expect(entry.docUrl).toMatch(OFFICIAL_SOURCE);
      for (const url of entry.issueUrls) expect(url).toMatch(GITHUB_ISSUE);
    }
  );

  it("uses non-global log patterns, so repeated test() calls are stateless", () => {
    const patterns = Object.values(FAILURES).flatMap((entry) => [
      ...entry.logPatterns
    ]);
    expect(patterns.filter((pattern) => pattern.global)).toEqual([]);
  });
});
