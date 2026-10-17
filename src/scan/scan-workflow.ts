import {
  AgentWorkflow,
  type AgentWorkflowEvent,
  type AgentWorkflowStep
} from "agents/workflows";
import { NonRetryableError } from "cloudflare:workflows";
import { createWorkersAI } from "workers-ai-provider";
import { RepoNotScannableError } from "../checks/repo-snapshot";
import type { ChatAgent } from "../server";
import { LLAMA_3_3_MODEL } from "../workers-ai";
import { explainFindings } from "./explain-findings";
import { scanRepository } from "./scan-repository";
import type { ScanStage } from "./scan-status";

/** Input for one scan; the chat agent starts it from ChatAgent.startScan. */
export type ScanParams = { readonly repoUrl: string };

type ScanProgress = { readonly stage: ScanStage };

// Download and checks: a GitHub or network hiccup is worth two quick retries.
const SCAN_STEP = {
  retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
  timeout: "2 minutes"
} as const;
const EXPLAIN_STEP = {
  retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
  timeout: "2 minutes"
} as const;
// Posting waits for the chat to settle, which can take a while if the user is mid-reply.
const POST_STEP = {
  retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
  timeout: "1 minute"
} as const;

/**
 * Scans one repository durably. Each step retries on its own and its result is stored, so a
 * failed explanation never downloads the repository again. Unhandled errors reach the agent's
 * onWorkflowError through AgentWorkflow.
 */
export class ScanWorkflow extends AgentWorkflow<
  ChatAgent,
  ScanParams,
  ScanProgress
> {
  async run(
    event: AgentWorkflowEvent<ScanParams>,
    step: AgentWorkflowStep
  ): Promise<void> {
    const report = await step.do("scan repository", SCAN_STEP, async () => {
      try {
        return await scanRepository(event.payload.repoUrl);
      } catch (error) {
        // Bad input stays bad: fail at once instead of retrying.
        if (error instanceof RepoNotScannableError) {
          throw new NonRetryableError(error.message, error.name);
        }
        throw error;
      }
    });

    await this.reportStage("explaining");
    const workersAi = createWorkersAI({ binding: this.env.AI });
    // The findings stand on their own, so a model outage must not fail the scan.
    const explanation = await step
      .do("explain findings", EXPLAIN_STEP, () =>
        explainFindings(report, workersAi(LLAMA_3_3_MODEL))
      )
      .catch((error: unknown) => {
        console.error("Explaining findings failed; posting without it.", error);
        return null;
      });

    await this.reportStage("posting");
    await step.do("post report", POST_STEP, () =>
      this.agent.saveScan(this.workflowId, report, explanation)
    );
  }

  // Progress only drives the UI's status line, so failing to report it must not fail the scan.
  private async reportStage(stage: ScanStage): Promise<void> {
    await this.reportProgress({ stage }).catch((error: unknown) => {
      console.warn(`Could not report scan stage "${stage}".`, error);
    });
  }
}
