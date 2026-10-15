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
