import { RepoNotScannableError } from "../checks/repo-snapshot";

/** A public GitHub repository to scan; `subdirectory` points at the app inside a monorepo. */
export type RepoLocation = {
  readonly owner: string;
  readonly repo: string;
  readonly ref: string;
  readonly subdirectory: string;
};

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const NAME_SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/;
const DEFAULT_REF = "HEAD";
const MAX_URL_CHARS = 500;

/**
 * Parses `github.com/owner/repo`, optionally followed by `/tree/<ref>/<subdirectory>`.
 * The ref must be one path segment (a branch like `feature/x` is read as ref `feature`).
 */
export function parseRepoUrl(input: string): RepoLocation {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_CHARS) {
    throw new RepoNotScannableError(
      `Expected a GitHub repository URL, but received ${JSON.stringify(trimmed.slice(0, 80))}.`
    );
  }
  const url = toUrl(
    /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  );
  if (url === null || !GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
    throw new RepoNotScannableError(
      `Expected a github.com URL, but received ${JSON.stringify(trimmed)}.`
    );
  }
  const [owner, rawRepo, marker, ref, ...subdirectory] = url.pathname
    .split("/")
    .filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/, "");
  if (
    !owner ||
    !repo ||
    !NAME_SEGMENT.test(owner) ||
    !NAME_SEGMENT.test(repo)
  ) {
    throw new RepoNotScannableError(
      `Expected github.com/<owner>/<repo>, but received ${url.pathname}.`
    );
  }
  if (marker !== undefined && (marker !== "tree" || ref === undefined)) {
    throw new RepoNotScannableError(
      `Expected the repository root or a /tree/<ref>/ path, but received ${url.pathname}.`
    );
  }
  return {
    owner,
    repo,
    ref: ref ?? DEFAULT_REF,
    subdirectory: subdirectory.join("/")
  };
}

function toUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null; // the caller reports the original input
  }
}
