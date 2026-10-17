import { tool } from "ai";
import { z } from "zod";
import { RepoNotScannableError } from "./checks/repo-snapshot";
import { formatRepoUrl, parseRepoUrl } from "./github/repo-url";
import { redact } from "./guardrails";
import { FAILURES } from "./knowledge/failures";
import { matchErrorLog } from "./log-match";
import type { ScanHistory } from "./scan/scan-history";
import type { ActiveScan } from "./scan/scan-status";

// Enough for a full `wrangler deploy` or `next build` failure; longer pastes are mostly noise.
const MAX_LOG_CHARS = 20_000;
const RECALLED_SCANS_LIMIT = 10;

/** What the tools need from the agent, passed in so tests can supply fakes. */
export type ChatToolDependencies = {
  /** Starts a ScanWorkflow; throws RepoNotScannableError for a URL that is not a GitHub repo. */
  readonly startScan: (repoUrl: string) => Promise<ActiveScan>;
  readonly history: ScanHistory;
};

/** The model's three tools: start a scan, explain a pasted log, recall earlier scans. */
export function createChatTools({ startScan, history }: ChatToolDependencies) {
  return {
    scan_repo: tool({
      description:
        "Scan a public GitHub repository of a Next.js app for problems deploying it to Cloudflare Workers. The scan runs in the background for up to a minute, and its report is posted to the chat when ready.",
      inputSchema: z.object({
        repoUrl: z
          .string()
          .describe(
            "https://github.com/<owner>/<repo>, optionally followed by /tree/<branch>/<app folder>"
          )
      }),
      execute: async ({ repoUrl }) => {
        try {
          const scan = await startScan(repoUrl);
          return {
            status: "started",
            scanId: scan.scanId,
            repoUrl: scan.repoUrl
          } as const;
        } catch (error) {
          // A malformed URL is the user's to fix, so the model relays the reason.
          if (!(error instanceof RepoNotScannableError)) throw error;
          return { status: "rejected", reason: error.message } as const;
        }
      }
    }),

    explain_log: tool({
      description:
        "Match a pasted build, deploy or runtime error log against known failures of Next.js on Cloudflare Workers. Returns each match with its cause, fix and documentation link.",
      inputSchema: z.object({
        log: z.string().max(MAX_LOG_CHARS).describe("The error log text")
      }),
      execute: async ({ log }) => ({
        matches: matchErrorLog(log).map(({ failureId, line }) => {
          const { title, whyItBreaks, fix, docUrl, issueUrls } =
            FAILURES[failureId];
          return {
            failureId,
            // The log is the user's, but the tool result is stored too: keep secrets out of it.
            matchedLine: redact(line),
            title,
            whyItBreaks,
            fix,
            docUrl,
            issueUrls
          };
        })
      })
    }),

    recall_scans: tool({
      description:
        "List this conversation's earlier scans, newest first, with their finding ids and counts. Optionally only for one repository.",
      inputSchema: z.object({
        repoUrl: z
          .string()
          .optional()
          .describe("Only return scans of this GitHub repository")
      }),
      execute: async ({ repoUrl }) => ({
        scans: history.recent(
          RECALLED_SCANS_LIMIT,
          repoUrl === undefined ? null : formatRepoUrl(parseRepoUrl(repoUrl))
        )
      })
    })
  };
}
