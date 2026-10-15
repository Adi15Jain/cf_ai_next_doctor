# Decisions

## 2026-10-15 — Pick the problem from evidence, not from a brainstorm

Context: Cloudflare's assignment fast-tracks candidates; ~488 prior `cf_ai_` repos exist and plain chatbots, study buddies, interview coaches, travel planners, code reviewers and incident copilots are saturated.
Decision: Four research passes (Cloudflare community forum, on-call surveys, Cloudflare's GitHub trackers, prior submissions) ranked candidate problems by frequency, agent-tractability and crowding. Chose "Next.js on Workers deploy doctor": 18 recurring failure types on GitHub, 14 detectable statically, none of the prior repos cover it, and it sits in Adi's own stack.
Alternatives: "Pending Nameserver Update" diagnoser (best evidence, but outside Adi's experience); on-call alert validation (best survey numbers, but 5+ similar submissions); TurfTech booking agent (real customer, weaker platform story).
Consequences: Narrow scope; every check must cite its source, which makes the knowledge base the core asset.

## 2026-10-15 — Start from cloudflare/agents-starter rather than from scratch

Context: The assignment needs chat input, streaming, tool calls and a Durable Object agent; the starter already wires `AIChatAgent`, `useAgentChat`, Vite and Kumo UI.
Decision: Copy the starter (MIT) and remove what the project does not need (MCP server panel, image attachments, demo tools).
Alternatives: Hand-written Worker + WebSocket chat (more code to explain, no gain); `@cloudflare/think` (experimental).
Consequences: Inherits the starter's lint/format config and UI kit; unused starter code must be deleted, not left disabled.

## 2026-10-15 — v1 is static checks + Durable Object memory; Vectorize and KV flags deferred

Context: The assignment requires LLM, workflow, chat input and memory. Job 2's interview checklist also lists Vectorize and a KV flag.
Decision: Ship v1 with deterministic checks, a Workflow per scan, Llama 3.3 explanations and per-session scan history in the agent's SQLite. Add Vectorize (semantic match of reworded error logs) and a KV flag (rules-only mode) as v2.
Alternatives: Include both in v1 (half a day more, more surface to explain before the core works).
Consequences: v1 error-log matching is substring/regex only; reworded logs may miss until v2.

## 2026-10-15 — Analyse repositories statically instead of running `next build`

Context: A Worker cannot run Node or `next build` (no child processes; CPU limits).
Decision: Checks read repository files (`package.json`, `next.config.*`, `wrangler.*`, `open-next.config.ts`, source) and pasted error logs. 14 of the 18 evidenced failure types are detectable this way.
Alternatives: Run real builds in Cloudflare Sandboxes/Containers (accurate, but heavier, slower, and paid-plan features; a "with more time" extension).
Consequences: Build-only failures (e.g. startup CPU limit) are detected from logs, not predicted.

## 2026-10-15 — Every rule carries its evidence, enforced by the type system

Context: A doctor that invents rules is worse than none; Cloudflare reviewers will check the claims.
Decision: `FailureEntry.issueUrls` is typed `readonly [string, ...string[]]`, so an entry without a GitHub issue does not compile; a test checks every URL's shape. All 43 cited issues and every doc URL were fetched before writing the rule.
Alternatives: A free-form list (an empty array would slip through review).
Consequences: Some real failures (wrong `main`/`assets` paths) are left out until an issue documents them.

## 2026-10-15 — Release notes beat doc pages when they disagree

Context: The OpenNext overview still says "Node Middleware … not yet supported", but PR #1309 added `proxy.ts` support in `@opennextjs/cloudflare` 1.20.3 (2026-08-26).
Decision: The proxy check is version-aware: it warns only when package.json allows an adapter below 1.20.3. Its doc link is the release note.
Alternatives: Trust the overview page (would flag working apps); drop the check (loses a real failure for older adapters).
Consequences: Uses the lowest version in the declared range, so `^1.19.0` warns even if the lockfile resolves 1.20.x. Hence a warning, not an error.

## 2026-10-15 — Brace-depth scan instead of a JavaScript parser for module-scope checks

Context: Two checks need to know whether a line runs at module load (a database client created there breaks across requests).
Decision: One pass over the text tracks `{ }` depth while skipping strings, template literals and comments: O(n) time, O(lines) space, ~40 lines of code.
Alternatives: The TypeScript compiler API or a parser such as acorn: exact, but megabytes of bundle in a Worker with a 1 s startup limit, and slower per file.
Consequences: Heuristic misses (e.g. a multi-line arrow function without braces) are possible, so these findings are warnings. Tests pin the cases it must get right.

## 2026-10-15 — Add smol-toml for wrangler.toml

Context: next-on-pages and older OpenNext repos use `wrangler.toml`; the checks need its bindings and migrations.
Decision: Add `smol-toml` (BSD-3-Clause, no dependencies). JSONC is handled by a 30-line string-aware stripper instead of a library.
Alternatives: Regex-scrape TOML (breaks on arrays of tables like `[[migrations]]`); skip TOML repos (loses the deprecated-adapter audience).
Consequences: One runtime dependency. Wrangler's own lookup order (json, jsonc, toml) is copied from its source.

## 2026-10-15 — One codeload tarball per scan, not the GitHub contents API

Context: A Worker on the free plan may make 50 subrequests per request, and the unauthenticated GitHub API allows 60 calls an hour. Reading a repo file by file would hit both limits.
Decision: Fetch `codeload.github.com/{owner}/{repo}/tar.gz/{ref}` once. It counts as one subrequest, needs no token, and the pax header carries the commit SHA for the report.
Alternatives: The contents or trees API (one call per file, rate-limited); a GitHub token (a secret to manage, and still many calls).
Consequences: Public repos only. A missing or private repo returns 404, which becomes a specific error.

## 2026-10-15 — Stream the tar and keep only scannable files

Context: Worker memory is 128 MB, and some repos commit large assets.
Decision: Pipe the response through `DecompressionStream` into a hand-written streaming tar reader (ustar, pax and GNU long names, checksum-checked). Keep only files the checks read, each under 512 KiB and 16 MiB in total.
Alternatives: Buffer the whole archive, then untar it with a library (memory scales with repo size; one more dependency).
Consequences: About 220 lines of parser, covered by tests that feed awkward chunk boundaries.

## 2026-10-15 — Add semver for the adapter version checks

Context: The version checks compare npm ranges such as `>=15.5.27 <16 || >=16.3.8` with the app's declared `next` range.
Decision: Add `semver` (ISC, no dependencies). npm itself uses it to resolve ranges, so results match what `npm install` does.
Alternatives: Hand-parse versions (wrong on `||`, `~`, prereleases); compare only major numbers (misses the 16.3.8 floor).
Consequences: One more runtime dependency, about 27 KB minified in the Worker bundle.

## 2026-10-15 — Check `next` against every adapter release package.json allows

Context: Checking only the newest allowed adapter release flagged `next 15.3.0` as an error, yet the lockfile can pin an older release that still supports it. Releases up to at least 1.6.5 declare no `next` peer at all.
Decision: Read every release the declared range allows from npm's abbreviated metadata (~230 KB). Error when none supports `next`; warning when only older releases do. A release with no `next` peer counts as unrestricted.
Alternatives: Read the lockfile (four formats, often missing); check the newest release only (false errors).
Consequences: One registry call per scan. If the registry is down, the scan continues without this check.

## 2026-10-15 — Fix false alarms found by scanning 14 real repos

Context: Running the checks on 14 public OpenNext repos turned up false positives the unit tests had missed.
Decision: `revalidate: N` as an object property is a warning (it may only touch the data cache), and `stale-while-revalidate` is skipped. Upstash `new Redis()` (HTTP-based) is not module-scope I/O. `WORKER_SELF_REFERENCE` is required by `doQueue`, not by `r2IncrementalCache`, as verified in OpenNext's source. `dev-init-missing` is reported only when code calls `getCloudflareContext()`.
Alternatives: Keep the stricter rules (noisy reports teach people to ignore them).
Consequences: Each fix has a test. The smoke script stays outside the repo because it calls live services.

## 2026-10-15 — Blank comments before matching config files

Context: Two real repos had `// incrementalCache: r2IncrementalCache` commented out and were still told to add an R2 binding.
Decision: `withoutComments()` replaces comments with spaces and keeps newlines, so line numbers stay correct. It is string-aware, so `"https://…"` survives. It runs on next.config, open-next.config and wrangler JSONC, which replaces the earlier JSONC stripper. Bindings in `env.<name>` sections count too, because Wrangler does not inherit them.
Alternatives: Per-regex `^\s*//` anchors (miss block comments and trailing comments).
Consequences: Regex literals that contain `//` are misread as comments. Config files rarely have them, so server code is not blanked wholesale.
