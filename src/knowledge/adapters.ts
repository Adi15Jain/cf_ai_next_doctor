import type { Adapter } from "../checks/repo-snapshot";

/** What Cloudflare advises for an app on a given adapter, with the page that says so. */
export type AdapterGuidance = {
  readonly advice: string;
  readonly docUrl: string;
};

const NEXTJS_GUIDE_URL =
  "https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/";

/**
 * From Cloudflare's Next.js guide, read on 2026-10-17: vinext (beta) is the recommended path,
 * OpenNext stays documented for apps that cannot migrate yet, and the next-on-pages README
 * says the package is deprecated and points to vinext.
 */
export const ADAPTER_GUIDANCE: Readonly<Record<Adapter, AdapterGuidance>> = {
  vinext: {
    advice:
      "vinext is Cloudflare's recommended way to run Next.js on Workers. It is in beta, so run `npx vinext check` before each production upgrade.",
    docUrl: NEXTJS_GUIDE_URL
  },
  opennext: {
    advice:
      "OpenNext is supported for existing apps, but Cloudflare now recommends vinext. Run `npx vinext check` to see whether this app can move.",
    docUrl:
      "https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/"
  },
  "next-on-pages": {
    advice:
      "@cloudflare/next-on-pages is deprecated and its repository is archived. Migrate to vinext, Cloudflare's recommended path, starting with `npx vinext check`.",
    docUrl: NEXTJS_GUIDE_URL
  },
  none: {
    advice:
      "No Cloudflare adapter is installed. Cloudflare recommends vinext: run `npx vinext check`, then `npx vinext init`.",
    docUrl: NEXTJS_GUIDE_URL
  }
};
