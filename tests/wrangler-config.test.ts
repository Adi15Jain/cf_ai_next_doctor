import { describe, expect, it } from "vitest";
import {
  checkNodejsCompat,
  checkWeakRefAvailability
} from "../src/checks/wrangler-config";
import {
  openNextApp,
  packageJson,
  snapshotOf,
  wranglerJsonc
} from "./fixtures";

function openNextWith(
  compatibilityDate: string,
  compatibilityFlags: string[] = []
) {
  return openNextApp({
    "wrangler.jsonc": wranglerJsonc({
      compatibility_date: compatibilityDate,
      compatibility_flags: compatibilityFlags
    })
  });
}

describe("checkNodejsCompat", () => {
  it("flags a missing nodejs_compat flag, pointing at the compatibility_date line", () => {
    const [finding] = checkNodejsCompat(openNextWith("2025-06-01"));
    expect(finding).toMatchObject({
      failureId: "nodejs-compat-missing",
      file: "wrangler.jsonc",
      line: 2
    });
  });

  it("flags an OpenNext date before 2024-09-23 even with the flag", () => {
    expect(
      checkNodejsCompat(openNextWith("2024-05-01", ["nodejs_compat"]))[0]
        ?.evidence
    ).toMatch(/before 2024-09-23/);
  });

  it("accepts the flag with a recent enough date", () => {
    expect(
      checkNodejsCompat(openNextWith("2025-06-01", ["nodejs_compat"]))
    ).toEqual([]);
  });

  it("accepts any date from 2026-08-04, when Node.js compatibility is on by default", () => {
    expect(checkNodejsCompat(openNextWith("2026-08-04"))).toEqual([]);
  });

  it("does not apply to vinext", () => {
    const snapshot = snapshotOf({
      "package.json": packageJson({}, { vinext: "^0.4.0" }),
      "wrangler.jsonc": wranglerJsonc({ compatibility_date: "2025-01-01" })
    });
    expect(checkNodejsCompat(snapshot)).toEqual([]);
  });
});

describe("checkWeakRefAvailability", () => {
  it("warns for a date before 2025-05-05", () => {
    expect(
      checkWeakRefAvailability(openNextWith("2025-01-01", ["nodejs_compat"]))
    ).toHaveLength(1);
  });

  it("accepts the enable_weak_ref flag on an older date", () => {
    expect(
      checkWeakRefAvailability(
        openNextWith("2025-01-01", ["nodejs_compat", "enable_weak_ref"])
      )
    ).toEqual([]);
  });
});
