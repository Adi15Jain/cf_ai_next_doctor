import type { Finding, Severity } from "./finding";
import type { RepoSnapshot, WranglerConfig } from "./repo-snapshot";
import { matchingLines, type LineMatch, type SourceFile } from "./source-file";

type BindingRequirement = {
  readonly kind: "r2" | "d1" | "service" | "durable-object";
  readonly name: string;
};

type RevalidateUsage = {
  readonly file: SourceFile;
  readonly match: LineMatch;
  readonly severity: Severity;
};

// A page-level `export const revalidate = 60` makes the page ISR, which needs the queue
// (issue #466): an error. A property such as fetch's `next: { revalidate: 60 }` may only
// affect the data cache: a warning. The lookbehind skips "stale-while-revalidate=120".
const SEGMENT_REVALIDATE = /^\s*export\s+const\s+revalidate\s*=\s*(\d+)/;
const PROPERTY_REVALIDATE = /(?<![\w-])revalidate\s*:\s*(\d+)/;
const QUEUE_OVERRIDE = /\bqueue\s*:/;

// Cache override → bindings it reads. From the OpenNext caching guide, checked against the
// adapter source: DOQueueHandler (not the R2 cache) is what reads WORKER_SELF_REFERENCE.
const CACHE_OVERRIDE_BINDINGS: ReadonlyMap<
  string,
  readonly BindingRequirement[]
> = new Map([
  ["r2IncrementalCache", [{ kind: "r2", name: "NEXT_INC_CACHE_R2_BUCKET" }]],
  ["d1NextTagCache", [{ kind: "d1", name: "NEXT_TAG_CACHE_D1" }]],
  [
    "doQueue",
    [
      { kind: "durable-object", name: "DOQueueHandler" },
      { kind: "service", name: "WORKER_SELF_REFERENCE" }
    ]
  ],
  ["doShardedTagCache", [{ kind: "durable-object", name: "DOShardedTagCache" }]]
]);

const REQUIREMENT_DESCRIPTION: Record<
  BindingRequirement["kind"],
  (name: string) => string
> = {
  r2: (name) => `an r2_buckets binding named ${name}`,
  d1: (name) => `a d1_databases binding named ${name}`,
  service: (name) => `a services binding named ${name}`,
  "durable-object": (name) =>
    `a durable_objects binding and a migration for class ${name}`
};

/** Time-based revalidation on OpenNext needs a queue in open-next.config. */
export function checkIsrQueue(snapshot: RepoSnapshot): Finding[] {
  if (snapshot.adapter !== "opennext") return [];
  const usage = findTimeBasedRevalidate(snapshot.serverFiles);
  const config = snapshot.openNextConfig;
  if (!usage || (config && QUEUE_OVERRIDE.test(config.text))) return [];
  const gap = config
    ? `${config.path} sets no queue`
    : "there is no open-next.config file";
  return [
    {
      failureId: "isr-queue-missing",
      severity: usage.severity,
      file: usage.file.path,
      line: usage.match.line,
      evidence: `${usage.match.text} (but ${gap})`
    }
  ];
}

/** Every cache override used in open-next.config needs its Wrangler binding. */
export function checkCacheBindings(snapshot: RepoSnapshot): Finding[] {
  const { openNextConfig, wrangler } = snapshot;
  if (snapshot.adapter !== "opennext" || !openNextConfig || !wrangler)
    return [];
  // Keyed by binding name so a binding two overrides share is reported once.
  const missing = new Map<string, string>();
  for (const [override, requirements] of CACHE_OVERRIDE_BINDINGS) {
    if (!new RegExp(`\\b${override}\\b`).test(openNextConfig.text)) continue;
    for (const requirement of requirements) {
      if (missing.has(requirement.name) || isSatisfied(requirement, wrangler))
        continue;
      const needs = REQUIREMENT_DESCRIPTION[requirement.kind](requirement.name);
      missing.set(
        requirement.name,
        `${openNextConfig.path} uses ${override}, which needs ${needs}`
      );
    }
  }
  return [...missing.values()].map(
    (evidence): Finding => ({
      failureId: "cache-binding-missing",
      severity: "error",
      file: wrangler.file.path,
      line: null,
      evidence
    })
  );
}

function findTimeBasedRevalidate(
  files: readonly SourceFile[]
): RevalidateUsage | null {
  return (
    firstPositiveRevalidate(files, SEGMENT_REVALIDATE, "error") ??
    firstPositiveRevalidate(files, PROPERTY_REVALIDATE, "warning")
  );
}

// `revalidate = 0` turns caching off rather than scheduling regeneration, so it is skipped.
function firstPositiveRevalidate(
  files: readonly SourceFile[],
  pattern: RegExp,
  severity: Severity
): RevalidateUsage | null {
  for (const file of files) {
    for (const match of matchingLines(file, pattern)) {
      if (Number(pattern.exec(match.text)?.[1]) > 0)
        return { file, match, severity };
    }
  }
  return null;
}

function isSatisfied(
  { kind, name }: BindingRequirement,
  wrangler: WranglerConfig
): boolean {
  switch (kind) {
    case "r2":
      return wrangler.r2Bindings.includes(name);
    case "d1":
      return wrangler.d1Bindings.includes(name);
    case "service":
      return wrangler.serviceBindings.includes(name);
    case "durable-object":
      return (
        wrangler.durableObjectClasses.includes(name) &&
        wrangler.migratedClasses.includes(name)
      );
  }
}
