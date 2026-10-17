import { countBySeverity } from "../checks/finding";
import type { ScanReport } from "./scan-repository";

/** The slice of Durable Object SQLite storage the history uses; `ctx.storage.sql` satisfies it. */
export type SqlExecutor = {
  exec(
    query: string,
    ...bindings: SqlStorageValue[]
  ): { toArray(): Record<string, SqlStorageValue>[] };
};

/** One earlier scan, as the recall_scans tool returns it to the model. */
export type ScanSummary = {
  readonly scanId: string;
  readonly repoUrl: string;
  readonly commitSha: string | null;
  readonly adapter: string;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly failureIds: readonly string[];
  /** ISO 8601, UTC. */
  readonly scannedAt: string;
};

/**
 * Scan results in the chat agent's own SQLite database, one row per scan. Only the summary is
 * stored: the full report is already in the chat, and the knowledge base explains each id.
 */
export class ScanHistory {
  readonly #sql: SqlExecutor;

  constructor(sql: SqlExecutor) {
    this.#sql = sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS scans (
      scan_id TEXT PRIMARY KEY,
      repo_url TEXT NOT NULL,
      commit_sha TEXT,
      adapter TEXT NOT NULL,
      error_count INTEGER NOT NULL,
      warning_count INTEGER NOT NULL,
      failure_ids TEXT NOT NULL,
      scanned_at TEXT NOT NULL
    )`);
  }

  /** Saving the same scan again (a retried Workflow step) replaces its row instead of adding one. */
  save(scanId: string, report: ScanReport, scannedAt: Date): void {
    const { errors, warnings } = countBySeverity(report.findings);
    const failureIds = [
      ...new Set(report.findings.map((finding) => finding.failureId))
    ];
    this.#sql.exec(
      `INSERT OR REPLACE INTO scans (scan_id, repo_url, commit_sha, adapter, error_count,
        warning_count, failure_ids, scanned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      scanId,
      report.repoUrl,
      report.commitSha,
      report.adapter,
      errors,
      warnings,
      failureIds.join(","),
      scannedAt.toISOString()
    );
  }

  /** Newest first, at most `limit`; only scans of `repoUrl` (canonical form) when it is given. */
  recent(limit: number, repoUrl: string | null): ScanSummary[] {
    const rows =
      repoUrl === null
        ? this.#sql.exec(
            "SELECT * FROM scans ORDER BY scanned_at DESC LIMIT ?",
            limit
          )
        : this.#sql.exec(
            "SELECT * FROM scans WHERE repo_url = ? ORDER BY scanned_at DESC LIMIT ?",
            repoUrl,
            limit
          );
    return rows.toArray().map(readSummary);
  }
}

// Validates each row at the storage boundary, so a schema mismatch fails here, by column name.
function readSummary(row: Record<string, SqlStorageValue>): ScanSummary {
  const commitSha = row.commit_sha;
  if (commitSha !== null && typeof commitSha !== "string") {
    throw new TypeError(
      `Expected scans.commit_sha to be text or null, but found ${typeof commitSha}.`
    );
  }
  const failureIds = textColumn(row, "failure_ids");
  return {
    scanId: textColumn(row, "scan_id"),
    repoUrl: textColumn(row, "repo_url"),
    commitSha,
    adapter: textColumn(row, "adapter"),
    errorCount: numberColumn(row, "error_count"),
    warningCount: numberColumn(row, "warning_count"),
    failureIds: failureIds === "" ? [] : failureIds.split(","),
    scannedAt: textColumn(row, "scanned_at")
  };
}

function textColumn(
  row: Record<string, SqlStorageValue>,
  name: string
): string {
  const value = row[name];
  if (typeof value !== "string") {
    throw new TypeError(
      `Expected scans.${name} to be text, but found ${typeof value}.`
    );
  }
  return value;
}

function numberColumn(
  row: Record<string, SqlStorageValue>,
  name: string
): number {
  const value = row[name];
  if (typeof value !== "number") {
    throw new TypeError(
      `Expected scans.${name} to be a number, but found ${typeof value}.`
    );
  }
  return value;
}
