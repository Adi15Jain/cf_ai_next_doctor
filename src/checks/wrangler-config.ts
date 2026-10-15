import type { Finding } from "./finding";
import type { RepoSnapshot } from "./repo-snapshot";
import { firstLineMatching } from "./source-file";

// Compatibility dates are ISO strings (YYYY-MM-DD), which order correctly as plain strings.
const OPENNEXT_MINIMUM_COMPATIBILITY_DATE = "2024-09-23";
const WEAK_REF_DEFAULT_FROM_DATE = "2025-05-05";
const NODEJS_COMPAT_DEFAULT_FROM_DATE = "2026-08-04";
const COMPATIBILITY_DATE_KEY = /compatibility_date/;

/** Node.js compatibility: needs nodejs_compat (and 2024-09-23+ on OpenNext) before 2026-08-04. */
export function checkNodejsCompat(snapshot: RepoSnapshot): Finding[] {
  const config = snapshot.wrangler;
  const needsNodeCompat =
    snapshot.adapter === "opennext" || snapshot.adapter === "next-on-pages";
  const date = config?.compatibilityDate;
  if (
    !config ||
    !date ||
    !needsNodeCompat ||
    date >= NODEJS_COMPAT_DEFAULT_FROM_DATE
  )
    return [];

  let evidence: string | null = null;
  if (!config.compatibilityFlags.includes("nodejs_compat")) {
    evidence = `compatibility_date is ${date} and compatibility_flags has no nodejs_compat`;
  } else if (
    snapshot.adapter === "opennext" &&
    date < OPENNEXT_MINIMUM_COMPATIBILITY_DATE
  ) {
    evidence = `nodejs_compat is set, but compatibility_date ${date} is before ${OPENNEXT_MINIMUM_COMPATIBILITY_DATE}`;
  }
  if (evidence === null) return [];
  return [
    {
      failureId: "nodejs-compat-missing",
      severity: "error",
      file: config.file.path,
      line: firstLineMatching(config.file, COMPATIBILITY_DATE_KEY),
      evidence
    }
  ];
}

/** FinalizationRegistry/WeakRef: on by default from 2025-05-05, or via enable_weak_ref. */
export function checkWeakRefAvailability(snapshot: RepoSnapshot): Finding[] {
  const config = snapshot.wrangler;
  const date = config?.compatibilityDate;
  if (!config || !date || snapshot.adapter !== "opennext") return [];
  if (
    date >= WEAK_REF_DEFAULT_FROM_DATE ||
    config.compatibilityFlags.includes("enable_weak_ref")
  ) {
    return [];
  }
  return [
    {
      failureId: "finalization-registry-unavailable",
      severity: "warning",
      file: config.file.path,
      line: firstLineMatching(config.file, COMPATIBILITY_DATE_KEY),
      evidence: `compatibility_date is ${date} and compatibility_flags has no enable_weak_ref`
    }
  ];
}
