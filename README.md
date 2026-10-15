# cf_ai_next_doctor

A deploy doctor for Next.js apps on Cloudflare Workers.

Paste a public GitHub repository URL, or a `wrangler deploy` / build error log, into
chat. It tells you which Cloudflare path the app is on (vinext, OpenNext, or the
deprecated next-on-pages), every failing check with file and line, the exact fix,
and the Cloudflare doc page and GitHub issue that back each one. Llama 3.3 explains
and orders the fixes; it cannot invent a finding.

Built for Cloudflare's AI application assignment. Work in progress; running
instructions arrive with the first deployable version.

## Why this problem

Deploying Next.js to Workers has a small set of recurring failures. Searching
GitHub on 2026-10-15 across `opennextjs/opennextjs-cloudflare`, `cloudflare/vinext`
and the archived `cloudflare/next-on-pages` found 18 recurring failure types, 14 of
them detectable from repository files alone, for example: a Next.js version ahead of
the adapter's support range (~40 issues), `Could not resolve "<package>"` at bundle
time (66), ISR used without a cache backend (45), `export const runtime = "edge"`
left in from old tutorials (87), and `proxy.ts` with OpenNext (25). Three widely
copied checks are now stale (for example the 3 MiB / 10 MiB size limit, removed on
2026-09-04) and are deliberately not checked.
