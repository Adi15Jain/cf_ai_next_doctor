import { describe, expect, it } from "vitest";
import { RepoNotScannableError } from "../src/checks/repo-snapshot";
import { parseRepoUrl } from "../src/github/repo-url";

describe("parseRepoUrl", () => {
  it("reads owner and repo, defaulting to the default branch and the repo root", () => {
    expect(parseRepoUrl("https://github.com/vercel/commerce")).toEqual({
      owner: "vercel",
      repo: "commerce",
      ref: "HEAD",
      subdirectory: ""
    });
  });

  it("accepts a URL without a scheme and with a .git suffix", () => {
    expect(parseRepoUrl("github.com/acme/shop.git")).toMatchObject({
      owner: "acme",
      repo: "shop"
    });
  });

  it("reads the ref and the app's subdirectory from a /tree/ URL", () => {
    expect(
      parseRepoUrl("https://github.com/acme/mono/tree/main/apps/web")
    ).toMatchObject({
      ref: "main",
      subdirectory: "apps/web"
    });
  });

  it("rejects hosts other than GitHub", () => {
    expect(() => parseRepoUrl("https://gitlab.com/acme/shop")).toThrow(
      RepoNotScannableError
    );
  });

  it("rejects a URL without a repository name", () => {
    expect(() => parseRepoUrl("https://github.com/acme")).toThrow(
      /github.com\/<owner>\/<repo>/
    );
  });

  it("rejects a link to a single file", () => {
    expect(() =>
      parseRepoUrl("https://github.com/acme/shop/blob/main/package.json")
    ).toThrow(/tree/);
  });
});
