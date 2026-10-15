import {
  isScannablePath,
  RepoNotScannableError
} from "../checks/repo-snapshot";
import type { RepoLocation } from "./repo-url";
import { readTar } from "./tar-stream";

/** The files the checks read (repo-relative path → text) and the commit they came from. */
export type RepoFiles = {
  readonly files: ReadonlyMap<string, string>;
  readonly commitSha: string | null;
};

const CODELOAD_URL = "https://codeload.github.com";
const DOWNLOAD_TIMEOUT_MS = 20_000;
// Larger source files are generated or vendored code; skipping them keeps scans fast.
const MAX_FILE_BYTES = 512 * 1024;
const MAX_KEPT_BYTES = 16 * 1024 * 1024;
const COMMIT_SHA = /^[0-9a-f]{40}$/;

/**
 * Downloads a public GitHub repository as one gzipped tarball and keeps only the files
 * the checks read. One subrequest regardless of repository size; memory holds kept files only.
 */
export async function fetchRepoFiles(
  location: RepoLocation,
  fetchFunction: typeof fetch = fetch
): Promise<RepoFiles> {
  const { owner, repo, ref } = location;
  const response = await fetchFunction(
    `${CODELOAD_URL}/${owner}/${repo}/tar.gz/${encodeURIComponent(ref)}`,
    { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) }
  );
  if (response.status === 404) {
    throw new RepoNotScannableError(
      `Expected a public repository at github.com/${owner}/${repo} (ref ${ref}), but GitHub returned 404. Private repositories are not supported.`
    );
  }
  if (!response.ok || response.body === null) {
    throw new RepoNotScannableError(
      `Expected GitHub to return the repository archive, but got HTTP ${response.status}.`
    );
  }

  const archive = await readTar(
    response.body.pipeThrough(new DecompressionStream("gzip")),
    keepScannableFiles(location.subdirectory)
  );
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  for (const file of archive.files) {
    const path = repoRelativePath(file.path, location.subdirectory);
    if (path !== null) files.set(path, decoder.decode(file.bytes));
  }
  const commitSha =
    archive.globalComment !== null && COMMIT_SHA.test(archive.globalComment)
      ? archive.globalComment
      : null;
  return { files, commitSha };
}

// Keeps files the checks read, under the size caps; the running total bounds memory.
function keepScannableFiles(
  subdirectory: string
): (archivePath: string, sizeBytes: number) => boolean {
  let keptBytes = 0;
  return (archivePath, sizeBytes) => {
    const path = repoRelativePath(archivePath, subdirectory);
    if (path === null || sizeBytes > MAX_FILE_BYTES || !isScannablePath(path))
      return false;
    keptBytes += sizeBytes;
    if (keptBytes > MAX_KEPT_BYTES) {
      throw new RepoNotScannableError(
        `Expected under ${MAX_KEPT_BYTES / 1024 / 1024} MiB of source code, but the repository has more.`
      );
    }
    return true;
  };
}

// GitHub archives wrap everything in a "<repo>-<ref>/" folder; drop it, then the subdirectory.
function repoRelativePath(
  archivePath: string,
  subdirectory: string
): string | null {
  const insideRoot = archivePath.slice(archivePath.indexOf("/") + 1);
  if (subdirectory === "") return insideRoot;
  const prefix = `${subdirectory}/`;
  return insideRoot.startsWith(prefix) ? insideRoot.slice(prefix.length) : null;
}
