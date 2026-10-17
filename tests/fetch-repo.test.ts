import { describe, expect, it } from "vitest";
import { RepoNotScannableError } from "../src/checks/repo-snapshot";
import {
  fetchRepoFiles,
  GitHubUnavailableError
} from "../src/github/fetch-repo";
import type { RepoLocation } from "../src/github/repo-url";
import { buildTar, gzip, paxRecord, type TarEntry } from "./fixtures";

const SHA = "4ea6a72cbabe2b62a6629a0c4d6d93e2f7a1c0de";
const ROOT: RepoLocation = {
  owner: "acme",
  repo: "shop",
  ref: "HEAD",
  subdirectory: ""
};

/** A fake GitHub that serves one gzipped archive and records the URLs requested. */
async function fakeGitHub(entries: readonly TarEntry[], status = 200) {
  const archive = await gzip(
    buildTar([
      {
        path: "pax_global_header",
        type: "g",
        content: paxRecord("comment", SHA)
      },
      ...entries
    ])
  );
  const requestedUrls: string[] = [];
  const fetchFunction: typeof fetch = async (input) => {
    requestedUrls.push(String(input));
    return status === 200
      ? new Response(archive)
      : new Response("Not Found", { status });
  };
  return { fetchFunction, requestedUrls };
}

describe("fetchRepoFiles", () => {
  it("downloads one tarball and returns the scannable files with repo-relative paths", async () => {
    const github = await fakeGitHub([
      { path: "shop-HEAD/package.json", content: "{}" },
      { path: "shop-HEAD/app/page.tsx", content: "export default 1;" },
      { path: "shop-HEAD/public/hero.jpg", content: "binary" },
      { path: "shop-HEAD/README.md", content: "# shop" }
    ]);
    const result = await fetchRepoFiles(ROOT, github.fetchFunction);
    expect(github.requestedUrls).toEqual([
      "https://codeload.github.com/acme/shop/tar.gz/HEAD"
    ]);
    expect([...result.files.keys()]).toEqual(["package.json", "app/page.tsx"]);
    expect(result.commitSha).toBe(SHA);
  });

  it("keeps only the requested subdirectory of a monorepo, relative to it", async () => {
    const github = await fakeGitHub([
      { path: "shop-main/package.json", content: "{}" },
      { path: "shop-main/apps/web/package.json", content: '{"name":"web"}' }
    ]);
    const result = await fetchRepoFiles(
      { ...ROOT, ref: "main", subdirectory: "apps/web" },
      github.fetchFunction
    );
    expect(Object.fromEntries(result.files)).toEqual({
      "package.json": '{"name":"web"}'
    });
  });

  it("skips source files over the size cap", async () => {
    const github = await fakeGitHub([
      { path: "shop-HEAD/lib/generated.ts", content: "x".repeat(600 * 1024) }
    ]);
    expect((await fetchRepoFiles(ROOT, github.fetchFunction)).files.size).toBe(
      0
    );
  });

  it("explains a 404 as a missing or private repository", async () => {
    const github = await fakeGitHub([], 404);
    await expect(fetchRepoFiles(ROOT, github.fetchFunction)).rejects.toThrow(
      RepoNotScannableError
    );
    await expect(fetchRepoFiles(ROOT, github.fetchFunction)).rejects.toThrow(
      /Private repositories/
    );
  });

  it("reports a GitHub server error as retryable, not as a bad repository", async () => {
    const github = await fakeGitHub([], 503);
    await expect(fetchRepoFiles(ROOT, github.fetchFunction)).rejects.toThrow(
      GitHubUnavailableError
    );
  });

  it("keeps package.json files in subfolders, but not from node_modules", async () => {
    const github = await fakeGitHub([
      { path: "shop-HEAD/apps/web/package.json", content: "{}" },
      { path: "shop-HEAD/node_modules/next/package.json", content: "{}" },
      { path: "shop-HEAD/apps/web/node_modules/x/package.json", content: "{}" }
    ]);
    const result = await fetchRepoFiles(ROOT, github.fetchFunction);
    expect([...result.files.keys()]).toEqual(["apps/web/package.json"]);
  });
});
