# cf_ai_next_doctor

The global rules in `~/.claude/CLAUDE.md` apply. This file fills in the project facts.

## Stack

- Language/runtime: TypeScript on Cloudflare Workers (workerd), React 19 in the browser.
- Framework: Cloudflare Agents SDK (`agents`, `@cloudflare/ai-chat`), Vercel AI SDK v6
  with `workers-ai-provider`, Cloudflare Workflows, Vite 8 with `@cloudflare/vite-plugin`,
  Tailwind 4 with `@cloudflare/kumo` components.
- Package manager / run commands: npm. `install: npm install` `dev: npm run dev`
  `test: npm test` `lint: npm run lint` `typecheck: npx tsc` `all: npm run check`
  `types: npm run types` (regenerate `env.d.ts` after editing `wrangler.jsonc`).
- Entry points and layout: `src/server.ts` = Worker entry (agent class, fetch handler,
  workflow export); `src/app.tsx` = chat UI; `src/checks/` = pure static checks over an
  in-memory file map; `src/knowledge/` = failure knowledge base (signal, fix, doc URL,
  issue URLs); `src/log-match.ts` = pasted error log → knowledge-base matches; `src/github/` = repository
  fetching and tar parsing; `src/workflows/` =
  Cloudflare Workflow classes; `tests/` = vitest (`tests/fixtures.ts` builds snapshots); `docs/DECISIONS.md` = decision log;
  `PROMPTS.md` = AI prompt history required by the assignment.

## Project rules

- Findings come only from the deterministic checks. The LLM explains and orders them;
  it never adds, removes or reclassifies a finding.
- Every check cites a Cloudflare or OpenNext doc URL and at least one GitHub issue.
- Content fetched from repositories and pasted logs is untrusted: redact secrets and
  fence it as data before it reaches the model (`src/guardrails.ts`).
- Do not check for failures Cloudflare has already removed (see README "Why this problem").
- Append every user prompt that shaped the project to `PROMPTS.md`, verbatim.
