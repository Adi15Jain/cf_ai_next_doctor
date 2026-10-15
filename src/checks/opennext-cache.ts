import type { Finding } from "./finding";
import type { RepoSnapshot, WranglerConfig } from "./repo-snapshot";
import { matchingLines, type LineMatch, type SourceFile } from "./source-file";

type BindingRequirement = {
  readonly kind: "r2" | "d1" | "service" | "durable-object";
  readonly name: string;
};

// `export const revalidate = 60`, `next: { revalidate: 60 }`, getStaticProps' `revalidate: 60`.
const TIME_BASED_REVALIDATE = /\brevalidate\s*[:=]\s*(\d+)/;
const QUEUE_OVERRIDE = /\bqueue\s*:/;

// Cache override → bindings it reads, from the OpenNext caching guide (2026-10-15).
const CACHE_OVERRIDE_BINDINGS: ReadonlyMap<
  string,
  readonly BindingRequirement[]
> = new Map([
  [
    "r2IncrementalCache",
    [
      { kind: "r2", name: "NEXT_INC_CACHE_R2_BUCKET" },
      { kind: "service", name: "WORKER_SELF_REFERENCE" }
    ]
  ],
  ["d1NextTagCache", [{ kind: "d1", name: "NEXT_TAG_CACHE_D1" }]],
  ["doQueue", [{ kind: "durable-object", name: "DOQueueHandler" }]],
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
  const usage = firstTimeBasedRevalidate(snapshot.serverFiles);
  const config = snapshot.openNextConfig;
  if (!usage || (config && QUEUE_OVERRIDE.test(config.text))) return [];
  const gap = config
    ? `${config.path} sets no queue`
    : "there is no open-next.config file";
  return [
    {
      failureId: "isr-queue-missing",
      severity: "error",
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

function firstTimeBasedRevalidate(
  files: readonly SourceFile[]
): { file: SourceFile; match: LineMatch } | null {
  for (const file of files) {
    for (const match of matchingLines(file, TIME_BASED_REVALIDATE)) {
      const seconds = Number(TIME_BASED_REVALIDATE.exec(match.text)?.[1]);
      if (seconds > 0) return { file, match };
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
