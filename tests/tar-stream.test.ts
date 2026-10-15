import { describe, expect, it } from "vitest";
import { RepoNotScannableError } from "../src/checks/repo-snapshot";
import { readTar } from "../src/github/tar-stream";
import { buildTar, paxRecord, streamOf } from "./fixtures";

const keepAll = () => true;
const textOf = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("readTar", () => {
  it("keeps accepted files and skips the rest, across awkward chunk boundaries", async () => {
    const archive = buildTar([
      { path: "repo-HEAD/", type: "5" },
      { path: "repo-HEAD/package.json", content: '{"name":"x"}' },
      { path: "repo-HEAD/public/logo.png", content: "x".repeat(2000) },
      { path: "repo-HEAD/app/page.tsx", content: "export default 1;" }
    ]);
    const contents = await readTar(
      streamOf(archive, 7),
      (path) => !path.endsWith(".png")
    );
    expect(
      contents.files.map((file) => [file.path, textOf(file.bytes)])
    ).toEqual([
      ["repo-HEAD/package.json", '{"name":"x"}'],
      ["repo-HEAD/app/page.tsx", "export default 1;"]
    ]);
  });

  it("tells keep() each file's size before reading its body", async () => {
    const sizes: number[] = [];
    await readTar(
      streamOf(buildTar([{ path: "a.ts", content: "12345" }]), 512),
      (_, size) => {
        sizes.push(size);
        return false;
      }
    );
    expect(sizes).toEqual([5]);
  });

  it("uses a pax path record for names longer than 100 characters", async () => {
    const longPath = `repo-HEAD/${"nested/".repeat(20)}page.tsx`;
    const archive = buildTar([
      { path: "PaxHeader", type: "x", content: paxRecord("path", longPath) },
      { path: "truncated-name", content: "ok" }
    ]);
    const contents = await readTar(streamOf(archive, 64), keepAll);
    expect(contents.files.map((file) => file.path)).toEqual([longPath]);
  });

  it("reads the commit from the pax global header comment", async () => {
    const sha = "4ea6a72cbabe2b62a6629a0c4d6d93e2f7a1c0de";
    const archive = buildTar([
      {
        path: "pax_global_header",
        type: "g",
        content: paxRecord("comment", sha)
      }
    ]);
    expect((await readTar(streamOf(archive, 512), keepAll)).globalComment).toBe(
      sha
    );
  });

  it("rejects an archive that ends in the middle of a file", async () => {
    const archive = buildTar([
      { path: "a.ts", content: "x".repeat(1500) }
    ]).slice(0, 1024);
    await expect(readTar(streamOf(archive, 100), keepAll)).rejects.toThrow(
      RepoNotScannableError
    );
  });

  it("rejects a header whose checksum does not match", async () => {
    const archive = buildTar([{ path: "a.ts", content: "x" }]);
    archive[0] = "b".charCodeAt(0);
    await expect(readTar(streamOf(archive, 512), keepAll)).rejects.toThrow(
      /checksum/
    );
  });
});
