/**
 * Recurring failures when deploying Next.js to Cloudflare Workers.
 * Every entry cites an official doc page (or release note) and at least one public
 * GitHub issue; all links were verified on 2026-10-15. Static checks emit findings
 * that point here by id, and the log matcher reads `logPatterns`.
 */

export type FailureEntry = {
  readonly title: string;
  readonly whyItBreaks: string;
  readonly fix: string;
  readonly docUrl: string;
  /** Non-empty by type: a rule without public evidence does not belong in this file. */
  readonly issueUrls: readonly [string, ...string[]];
  readonly logPatterns: readonly RegExp[];
};

export const FAILURES = {
  "edge-runtime-declared": {
    title: 'Route sets `export const runtime = "edge"`',
    whyItBreaks:
      "On Workers, Next.js runs on its Node.js runtime. OpenNext does not support the edge runtime, and next-on-pages, which required it, is deprecated.",
    fix: 'Delete the `export const runtime = "edge"` line. The Node.js runtime is the target on Workers.',
    docUrl: "https://opennext.js.org/cloudflare/get-started",
    issueUrls: [
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/525",
      "https://github.com/cloudflare/vinext/issues/1338"
    ],
    logPatterns: []
  },

  "proxy-needs-newer-adapter": {
    title: "`proxy.ts` needs @opennextjs/cloudflare 1.20.3 or later",
    whyItBreaks:
      "Next.js 16 replaces middleware with proxy.ts, which always runs on the Node.js runtime. OpenNext rejected it at build time until 1.20.3 (released 2026-08-26). The OpenNext overview page still says Node middleware is unsupported; the release notes are newer.",
    fix: "Upgrade the adapter: `npm install @opennextjs/cloudflare@latest`.",
    docUrl:
      "https://github.com/opennextjs/opennextjs-cloudflare/releases/tag/%40opennextjs%2Fcloudflare%401.20.3",
    issueUrls: [
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/1213",
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/1277"
    ],
    logPatterns: [/Node\.js middleware is not currently supported/]
  },

  "nodejs-compat-missing": {
    title: "Node.js compatibility is not enabled",
    whyItBreaks:
      "Next.js server code imports Node.js built-ins. OpenNext requires the nodejs_compat flag with a compatibility date of 2024-09-23 or later; from 2026-08-04 Node.js compatibility is on by default.",
    fix: 'Set `compatibility_date` to today\'s date (2026-08-04 or later turns Node.js compatibility on by default), or add `"compatibility_flags": ["nodejs_compat"]` with a date of 2024-09-23 or later.',
    docUrl:
      "https://developers.cloudflare.com/workers/configuration/compatibility-flags/",
    issueUrls: ["https://github.com/cloudflare/next-on-pages/issues/199"],
    logPatterns: [
      /No such module "node:/,
      /Could not resolve "(?:node:)?async_hooks"/
    ]
  },

  "finalization-registry-unavailable": {
    title: "Compatibility date is before 2025-05-05",
    whyItBreaks:
      "FinalizationRegistry and WeakRef are enabled by default from compatibility date 2025-05-05. With an older date, code that uses them fails with `ReferenceError: FinalizationRegistry is not defined` (reported after ISR revalidation).",
    fix: "Set `compatibility_date` to 2025-05-05 or later, or add the `enable_weak_ref` compatibility flag.",
    docUrl:
      "https://developers.cloudflare.com/workers/configuration/compatibility-flags/",
    issueUrls: [
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/660"
    ],
    logPatterns: [/FinalizationRegistry is not defined/]
  },

  "module-scope-io": {
    title: "Client or I/O created at module scope",
    whyItBreaks:
      "A Worker cannot do I/O outside a request, and an I/O object created during one request cannot be used by another. A database client created at module scope is shared across requests, so later requests fail.",
    fix: "Create the client inside the request handler, route or server action that uses it.",
    docUrl: "https://opennext.js.org/cloudflare/troubleshooting",
    issueUrls: [
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/548",
      "https://github.com/cloudflare/next-on-pages/issues/949",
      "https://github.com/cloudflare/vinext/issues/537",
      "https://github.com/cloudflare/workerd/issues/2490"
    ],
    logPatterns: [
      /Cannot perform I\/O on behalf of a different request/,
      /Disallowed operation called within global scope/
    ]
  },

  "cloudflare-context-at-module-scope": {
    title: "`getCloudflareContext()` called at module scope",
    whyItBreaks:
      "Bindings and environment variables are provided per request. At module scope no request exists yet, so they are not available.",
    fix: "Call `getCloudflareContext()` inside the handler that needs it. In static (SSG) routes use `await getCloudflareContext({ async: true })`.",
    docUrl: "https://opennext.js.org/cloudflare/bindings",
    issueUrls: [
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/231",
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/596"
    ],
    logPatterns: []
  },

  "dev-init-missing": {
    title: "next.config does not call `initOpenNextCloudflareForDev()`",
    whyItBreaks:
      "OpenNext's setup requires next.config to call initOpenNextCloudflareForDev() so bindings work in `next dev`. Without it, `getCloudflareContext()` throws, including while `next build` renders static pages.",
    fix: 'In next.config, add `import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";` and call `initOpenNextCloudflareForDev();`.',
    docUrl: "https://opennext.js.org/cloudflare/get-started",
    issueUrls: [
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/317"
    ],
    logPatterns: [
      /has been called without having called `?initOpenNextCloudflareForDev/
    ]
  },

  "workerd-package-bundled": {
    title: "Package with workerd-specific code is bundled",
    whyItBreaks:
      "Some packages publish a separate entry point for workerd. Next.js bundles server code with Node.js conditions, so unless the package is in `serverExternalPackages` the Worker gets its Node.js build.",
    fix: "Add the package to `serverExternalPackages` in next.config (for Prisma, also add `.prisma/client`).",
    docUrl: "https://opennext.js.org/cloudflare/howtos/workerd",
    issueUrls: [
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/548"
    ],
    logPatterns: [
      /Could not resolve "(?:postgres|jose|@prisma\/client|\.prisma\/client|@libsql\/isomorphic-ws|react-textarea-autosize)/
    ]
  },

  "native-addon-dependency": {
    title: "Dependency uses a native Node.js addon",
    whyItBreaks:
      "Workers cannot load native Node.js addons (`.node` binaries); N-API support is an open feature request. Packages built on them fail when the server bundle is built.",
    fix: "Replace it: bcryptjs instead of bcrypt, D1 instead of better-sqlite3 or sqlite3, the Cloudflare Images binding instead of sharp.",
    docUrl: "https://developers.cloudflare.com/workers/runtime-apis/nodejs/",
    issueUrls: [
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/1394",
      "https://github.com/cloudflare/workerd/issues/4587"
    ],
    logPatterns: [/Could not resolve require\("[^"]*\.node"\)/]
  },

  "isr-queue-missing": {
    title: "Time-based revalidation without an OpenNext queue",
    whyItBreaks:
      "OpenNext needs a queue to regenerate pages whose `revalidate` time has passed. Without one, regeneration fails with `FatalError: Dummy queue is not implemented`.",
    fix: "In open-next.config.ts set an incremental cache and a queue (for example `incrementalCache: r2IncrementalCache` and `queue: doQueue`) and add their Wrangler bindings from the caching guide.",
    docUrl: "https://opennext.js.org/cloudflare/caching",
    issueUrls: [
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/466"
    ],
    logPatterns: [/Dummy queue is not implemented/]
  },

  "cache-binding-missing": {
    title: "OpenNext cache override without its Wrangler binding",
    whyItBreaks:
      "Each cache override in open-next.config.ts reads a specific binding from the Wrangler config. A missing binding is easy to overlook, and the resulting error does not name it.",
    fix: "Add the binding named in this finding to your Wrangler config, exactly as shown in the caching guide.",
    docUrl: "https://opennext.js.org/cloudflare/caching",
    issueUrls: [
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/1108",
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/502"
    ],
    logPatterns: [/referenced the class "(?:DOQueueHandler|DOShardedTagCache)"/]
  },

  "next-version-unsupported": {
    title: "Next.js version outside the adapter's supported range",
    whyItBreaks:
      "OpenNext patches Next.js internals that change between releases, and each adapter release declares the Next.js versions it supports. Outside that range the app can build successfully, then crash every request with Error 1101.",
    fix: "Upgrade `@opennextjs/cloudflare` to the latest release, or change `next` to a version inside the range that release supports (`npm view @opennextjs/cloudflare peerDependencies`).",
    docUrl: "https://opennext.js.org/cloudflare",
    issueUrls: [
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/1049",
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/1157"
    ],
    logPatterns: [
      /Cannot assign to read only property 'setImmediate'/,
      /Unexpected loadManifest\(/
    ]
  },

  "unenv-api-not-implemented": {
    title: "Node.js API that Workers only stub",
    whyItBreaks:
      "Workers implement some Node.js modules only as stubs. Calling one throws `[unenv] <api> is not implemented yet!`.",
    fix: "Find the package making the call (Prisma and SDKs that read files are common). Use its edge or workerd build, add it to serverExternalPackages if it ships workerd-specific code, or replace it.",
    docUrl: "https://developers.cloudflare.com/workers/runtime-apis/nodejs/",
    issueUrls: [
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/623",
      "https://github.com/opennextjs/opennextjs-cloudflare/issues/79"
    ],
    logPatterns: [/\[unenv\] [\w.]+ is not implemented yet/]
  },

  "startup-cpu-limit": {
    title: "Worker startup exceeds the CPU limit",
    whyItBreaks:
      "Workers must evaluate the script's global scope within the 1 second startup limit, otherwise the upload is rejected.",
    fix: "Move work out of module scope and import large dependencies lazily inside the handlers that need them.",
    docUrl: "https://developers.cloudflare.com/workers/platform/limits/",
    issueUrls: [
      "https://github.com/cloudflare/workers-sdk/issues/10723",
      "https://github.com/cloudflare/next-on-pages/issues/54"
    ],
    logPatterns: [
      /Script startup exceeded CPU time limit/,
      /exceeded startup limits/
    ]
  }
} as const satisfies Record<string, FailureEntry>;

export type FailureId = keyof typeof FAILURES;
