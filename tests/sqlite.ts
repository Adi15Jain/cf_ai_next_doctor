import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import type { SqlExecutor } from "../src/scan/scan-history";

/**
 * A fresh in-memory SQLite database behind the same `exec` shape as Durable Object storage,
 * so the history's real SQL runs in tests. Uses Node's built-in node:sqlite (Node 22.13+).
 */
export function inMemorySql(): SqlExecutor {
  const database = new DatabaseSync(":memory:");
  return {
    exec(query, ...bindings) {
      const rows = database
        .prepare(query)
        .all(
          ...bindings.map((value) =>
            value instanceof ArrayBuffer ? new Uint8Array(value) : value
          )
        );
      return {
        toArray: () =>
          rows.map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([column, value]) => [
                column,
                toStorageValue(value)
              ])
            )
          )
      };
    }
  };
}

// Durable Object SQLite returns numbers and ArrayBuffers where node:sqlite may return
// bigints and Uint8Arrays.
function toStorageValue(value: SQLOutputValue): SqlStorageValue {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Uint8Array) return value.slice().buffer;
  return value;
}
