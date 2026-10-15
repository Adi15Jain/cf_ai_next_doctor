import { describe, expect, it } from "vitest";
import {
  checkCacheBindings,
  checkIsrQueue
} from "../src/checks/opennext-cache";
import { openNextApp, wranglerJsonc } from "./fixtures";

const ISR_PAGE =
  "export const revalidate = 60;\nexport default function Page() {}\n";
const R2_ONLY_CONFIG =
  "export default defineCloudflareConfig({ incrementalCache: r2IncrementalCache });";
const WITH_DO_QUEUE =
  "export default defineCloudflareConfig({ incrementalCache: r2IncrementalCache, queue: doQueue });";

describe("checkIsrQueue", () => {
  it("flags time-based revalidation when open-next.config sets no queue", () => {
    const snapshot = openNextApp({
      "app/page.tsx": ISR_PAGE,
      "open-next.config.ts": R2_ONLY_CONFIG
    });
    expect(checkIsrQueue(snapshot)).toMatchObject([
      { failureId: "isr-queue-missing", file: "app/page.tsx", line: 1 }
    ]);
  });

  it("flags it when there is no open-next.config at all", () => {
    expect(
      checkIsrQueue(openNextApp({ "app/page.tsx": ISR_PAGE }))[0]?.evidence
    ).toMatch(/no open-next.config/);
  });

  it("accepts a configured queue", () => {
    const snapshot = openNextApp({
      "app/page.tsx": ISR_PAGE,
      "open-next.config.ts": WITH_DO_QUEUE
    });
    expect(checkIsrQueue(snapshot)).toEqual([]);
  });

  it("ignores revalidate = 0, which disables caching rather than scheduling regeneration", () => {
    expect(
      checkIsrQueue(
        openNextApp({ "app/page.tsx": "export const revalidate = 0;" })
      )
    ).toEqual([]);
  });

  it("treats a fetch-level revalidate as a warning, since it may only touch the data cache", () => {
    const page =
      "const data = await fetch(url, { next: { revalidate: 3600 } });";
    expect(checkIsrQueue(openNextApp({ "app/page.tsx": page }))).toMatchObject([
      { severity: "warning" }
    ]);
  });

  it("ignores stale-while-revalidate in a Cache-Control header", () => {
    const route =
      "const CACHE = 'public, max-age=30, stale-while-revalidate=120';";
    expect(checkIsrQueue(openNextApp({ "app/api/route.ts": route }))).toEqual(
      []
    );
  });
});

describe("checkCacheBindings", () => {
  const completeWrangler = wranglerJsonc({
    services: [{ binding: "WORKER_SELF_REFERENCE", service: "app" }],
    r2_buckets: [{ binding: "NEXT_INC_CACHE_R2_BUCKET", bucket_name: "cache" }],
    durable_objects: {
      bindings: [{ name: "NEXT_CACHE_DO_QUEUE", class_name: "DOQueueHandler" }]
    },
    migrations: [{ tag: "v1", new_sqlite_classes: ["DOQueueHandler"] }]
  });

  it("accepts a config with every binding its overrides need", () => {
    const snapshot = openNextApp({
      "open-next.config.ts": WITH_DO_QUEUE,
      "wrangler.jsonc": completeWrangler
    });
    expect(checkCacheBindings(snapshot)).toEqual([]);
  });

  it("reports each missing binding by name", () => {
    const snapshot = openNextApp({
      "open-next.config.ts": WITH_DO_QUEUE,
      "wrangler.jsonc": "{}"
    });
    const evidence = checkCacheBindings(snapshot).map(
      (finding) => finding.evidence
    );
    expect(evidence).toEqual([
      "open-next.config.ts uses r2IncrementalCache, which needs an r2_buckets binding named NEXT_INC_CACHE_R2_BUCKET",
      "open-next.config.ts uses doQueue, which needs a durable_objects binding and a migration for class DOQueueHandler",
      "open-next.config.ts uses doQueue, which needs a services binding named WORKER_SELF_REFERENCE"
    ]);
  });

  it("does not require WORKER_SELF_REFERENCE for the R2 cache alone", () => {
    const snapshot = openNextApp({
      "open-next.config.ts": R2_ONLY_CONFIG,
      "wrangler.jsonc": wranglerJsonc({
        r2_buckets: [
          { binding: "NEXT_INC_CACHE_R2_BUCKET", bucket_name: "cache" }
        ]
      })
    });
    expect(checkCacheBindings(snapshot)).toEqual([]);
  });

  it("requires the Durable Object migration, not just the binding", () => {
    const withoutMigration = wranglerJsonc({
      services: [{ binding: "WORKER_SELF_REFERENCE", service: "app" }],
      r2_buckets: [
        { binding: "NEXT_INC_CACHE_R2_BUCKET", bucket_name: "cache" }
      ],
      durable_objects: {
        bindings: [
          { name: "NEXT_CACHE_DO_QUEUE", class_name: "DOQueueHandler" }
        ]
      }
    });
    const snapshot = openNextApp({
      "open-next.config.ts": WITH_DO_QUEUE,
      "wrangler.jsonc": withoutMigration
    });
    expect(checkCacheBindings(snapshot)).toHaveLength(1);
  });

  it("ignores overrides that are commented out", () => {
    const commentedOut = `export default defineCloudflareConfig({
  // incrementalCache: r2IncrementalCache,
  /* queue: doQueue, */
});`;
    const snapshot = openNextApp({
      "open-next.config.ts": commentedOut,
      "wrangler.jsonc": "{}"
    });
    expect(checkCacheBindings(snapshot)).toEqual([]);
  });

  it("counts bindings declared only in an env section", () => {
    const snapshot = openNextApp({
      "open-next.config.ts": R2_ONLY_CONFIG,
      "wrangler.jsonc": wranglerJsonc({
        env: {
          production: {
            r2_buckets: [
              { binding: "NEXT_INC_CACHE_R2_BUCKET", bucket_name: "cache" }
            ]
          }
        }
      })
    });
    expect(checkCacheBindings(snapshot)).toEqual([]);
  });
});
