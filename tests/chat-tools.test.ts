import type { Tool } from "ai";
import { describe, expect, it } from "vitest";
import { createChatTools } from "../src/chat-tools";
import { formatRepoUrl, parseRepoUrl } from "../src/github/repo-url";
import { ScanHistory } from "../src/scan/scan-history";
import { inMemorySql } from "./sqlite";

const CALL_OPTIONS = { toolCallId: "call-1", messages: [] };

/** Runs a tool's execute function the way the AI SDK does. */
async function run<Input, Output>(
  tool: Tool<Input, Output>,
  input: Input
): Promise<unknown> {
  if (tool.execute === undefined) throw new Error("Expected a server tool.");
  return tool.execute(input, CALL_OPTIONS);
}

/**
 * Tools wired to an in-memory history and a scan starter that validates the URL as the
 * agent does, but records the scan instead of starting a Workflow.
 */
function toolsWithFakes() {
  const startedScans: string[] = [];
  const history = new ScanHistory(inMemorySql());
  const tools = createChatTools({
    startScan: async (repoUrl) => {
      const canonicalUrl = formatRepoUrl(parseRepoUrl(repoUrl));
      startedScans.push(canonicalUrl);
      return {
        scanId: `scan-${startedScans.length}`,
        repoUrl: canonicalUrl,
        stage: "scanning"
      };
    },
    history
  });
  return { tools, startedScans, history };
}

describe("scan_repo", () => {
  it("starts a scan for the canonical repository URL", async () => {
    const { tools, startedScans } = toolsWithFakes();
    expect(
      await run(tools.scan_repo, { repoUrl: "github.com/Acme/Shop" })
    ).toEqual({
      status: "started",
      scanId: "scan-1",
      repoUrl: "https://github.com/acme/shop"
    });
    expect(startedScans).toEqual(["https://github.com/acme/shop"]);
  });

  it("rejects a non-GitHub URL with a reason, without starting a scan", async () => {
    const { tools, startedScans } = toolsWithFakes();
    expect(
      await run(tools.scan_repo, { repoUrl: "https://gitlab.com/acme/shop" })
    ).toMatchObject({ status: "rejected", reason: /github\.com/ });
    expect(startedScans).toEqual([]);
  });
});

describe("explain_log", () => {
  it("returns each known failure in the log with its fix and links", async () => {
    const { tools } = toolsWithFakes();
    const log = 'build ok\n✘ [ERROR] No such module "node:buffer".\ndone';
    expect(await run(tools.explain_log, { log })).toMatchObject({
      matches: [
        {
          failureId: "nodejs-compat-missing",
          matchedLine: '✘ [ERROR] No such module "node:buffer".',
          docUrl: expect.stringMatching(
            /^https:\/\/developers\.cloudflare\.com/
          )
        }
      ]
    });
  });

  it("redacts secrets in the quoted log line", async () => {
    const { tools } = toolsWithFakes();
    const log =
      'No such module "node:buffer" (Authorization: Bearer abcdefgh12345678)';
    expect(JSON.stringify(await run(tools.explain_log, { log }))).not.toContain(
      "abcdefgh12345678"
    );
  });

  it("returns no matches for an unknown error", async () => {
    const { tools } = toolsWithFakes();
    expect(await run(tools.explain_log, { log: "Segmentation fault" })).toEqual(
      { matches: [] }
    );
  });
});

describe("recall_scans", () => {
  it("returns only the requested repository's scans, however its URL is written", async () => {
    const { tools, history } = toolsWithFakes();
    const empty = {
      commitSha: null,
      adapter: "opennext",
      findings: [],
      versionCheckSkipped: null
    } as const;
    history.save(
      "scan-1",
      { ...empty, repoUrl: "https://github.com/acme/shop" },
      new Date("2026-10-16T10:00:00Z")
    );
    history.save(
      "scan-2",
      { ...empty, repoUrl: "https://github.com/acme/blog" },
      new Date("2026-10-17T10:00:00Z")
    );
    expect(
      await run(tools.recall_scans, { repoUrl: "github.com/ACME/shop" })
    ).toMatchObject({ scans: [{ scanId: "scan-1" }] });
  });
});
