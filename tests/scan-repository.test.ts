import { describe, expect, it } from "vitest";
import { RepoNotScannableError } from "../src/checks/repo-snapshot";
import { scanRepository } from "../src/scan/scan-repository";
import { buildTar, gzip, packageJson, wranglerJsonc } from "./fixtures";

const EDGE_ROUTE = 'export const runtime = "edge";\nexport function GET() {}';
const WRANGLER = wranglerJsonc({
  compatibility_date: "2026-10-01",
  compatibility_flags: ["nodejs_compat"]
});

type Registry = "online" | "offline";

/** GitHub serving `files` as acme/shop, plus an npm registry that is online or offline. */
async function fakeInternet(files: Record<string, string>, registry: Registry) {
  const archive = await gzip(
    buildTar(
      Object.entries(files).map(([path, content]) => ({
        path: `shop-HEAD/${path}`,
        content
      }))
    )
  );
  const requestedUrls: string[] = [];
  const fetchFunction: typeof fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    // GitHub matches owner and repo case-insensitively.
    if (
      url.toLowerCase().startsWith("https://codeload.github.com/acme/shop/")
    ) {
      return new Response(archive);
    }
    if (
      url.startsWith("https://registry.npmjs.org/") &&
      registry === "online"
    ) {
      return Response.json({
        versions: { "1.20.11": { peerDependencies: { next: ">=16.3.8" } } }
      });
    }
    throw new TypeError(`fetch failed: ${url}`);
  };
  return { fetchFunction, requestedUrls };
}

function openNextShop(): Record<string, string> {
  return {
    "package.json": packageJson({ "@opennextjs/cloudflare": "^1.20.11" }),
    "wrangler.jsonc": WRANGLER,
    "app/api/route.ts": EDGE_ROUTE
  };
}

describe("scanRepository", () => {
  it("scans the repository and reports findings under the canonical URL", async () => {
    const internet = await fakeInternet(openNextShop(), "online");
    const report = await scanRepository(
      "github.com/Acme/Shop",
      internet.fetchFunction
    );
    expect(report).toMatchObject({
      repoUrl: "https://github.com/acme/shop",
      adapter: "opennext",
      versionCheckSkipped: null
    });
    expect(report.findings.map((finding) => finding.failureId)).toEqual([
      "edge-runtime-declared"
    ]);
  });

  it("skips only the version check when the npm registry is unreachable", async () => {
    const internet = await fakeInternet(openNextShop(), "offline");
    const report = await scanRepository(
      "https://github.com/acme/shop",
      internet.fetchFunction
    );
    expect(report.versionCheckSkipped).toMatch(/npm registry/);
    expect(report.findings).toHaveLength(1);
  });

  it("does not call the registry for apps on another adapter", async () => {
    const internet = await fakeInternet(
      { "package.json": packageJson({}, { vinext: "^0.4.0" }) },
      "online"
    );
    await scanRepository(
      "https://github.com/acme/shop",
      internet.fetchFunction
    );
    expect(internet.requestedUrls).toEqual([
      "https://codeload.github.com/acme/shop/tar.gz/HEAD"
    ]);
  });

  it("rejects a repository that is not a Next.js app", async () => {
    const internet = await fakeInternet(
      { "package.json": JSON.stringify({ dependencies: { react: "19.0.0" } }) },
      "online"
    );
    await expect(
      scanRepository("https://github.com/acme/shop", internet.fetchFunction)
    ).rejects.toThrow(RepoNotScannableError);
  });

  it("scans the only Next.js app when the repository root holds other code", async () => {
    const internet = await fakeInternet(
      {
        "pyproject.toml": "[project]",
        "web/package.json": packageJson({
          "@opennextjs/cloudflare": "^1.20.11"
        }),
        "web/wrangler.jsonc": WRANGLER,
        "web/app/api/route.ts": EDGE_ROUTE
      },
      "online"
    );
    const report = await scanRepository(
      "https://github.com/acme/shop",
      internet.fetchFunction
    );
    expect(report.repoUrl).toBe("https://github.com/acme/shop/tree/HEAD/web");
    expect(report.findings.map((finding) => finding.failureId)).toEqual([
      "edge-runtime-declared"
    ]);
  });

  it("finds the app in a monorepo whose root package.json has no next, skipping libraries", async () => {
    const internet = await fakeInternet(
      {
        "package.json": JSON.stringify({
          workspaces: ["apps/*", "packages/*"]
        }),
        "apps/web/package.json": packageJson(),
        "packages/ui/package.json": JSON.stringify({
          devDependencies: { next: "^16.3.8" }
        }),
        "node_modules/next/package.json": packageJson()
      },
      "online"
    );
    const report = await scanRepository(
      "https://github.com/acme/shop",
      internet.fetchFunction
    );
    expect(report.repoUrl).toBe(
      "https://github.com/acme/shop/tree/HEAD/apps/web"
    );
  });

  it("lists a scan URL for each app when there are several", async () => {
    const internet = await fakeInternet(
      {
        "web/package.json": packageJson(),
        "admin/package.json": packageJson()
      },
      "online"
    );
    await expect(
      scanRepository("https://github.com/acme/shop", internet.fetchFunction)
    ).rejects.toThrow(
      /has 2\. Scan one of: .*\/tree\/HEAD\/(web|admin), .*\/tree\/HEAD\/(web|admin)$/
    );
  });

  it("says so when no package.json in the repository depends on next", async () => {
    const internet = await fakeInternet({ "README.md": "# docs" }, "online");
    await expect(
      scanRepository("https://github.com/acme/shop", internet.fetchFunction)
    ).rejects.toThrow('no package.json in this repository depends on "next"');
  });
});
