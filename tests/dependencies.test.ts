import { describe, expect, it } from "vitest";
import {
  checkNativeAddons,
  checkNextVersionSupported,
  checkProxyAdapterVersion
} from "../src/checks/dependencies";
import { openNextApp, packageJson, snapshotOf } from "./fixtures";

// Newest first, as fetchOpenNextReleases returns them.
const ALLOWED_RELEASES = [
  { version: "1.20.11", supportedNextRange: ">=15.5.27 <16 || >=16.3.8" },
  { version: "1.19.0", supportedNextRange: ">=15.0.0" }
];

describe("checkNextVersionSupported", () => {
  it("accepts a Next.js range the newest allowed release supports", () => {
    expect(
      checkNextVersionSupported(
        openNextApp({}, { next: "^16.1.0" }),
        ALLOWED_RELEASES
      )
    ).toEqual([]);
  });

  it("warns when only an older allowed release supports the pinned Next.js version", () => {
    const [finding] = checkNextVersionSupported(
      openNextApp({}, { next: "16.1.0" }),
      ALLOWED_RELEASES
    );
    expect(finding).toMatchObject({ severity: "warning" });
    expect(finding?.evidence).toMatch(
      /works only up to @opennextjs\/cloudflare 1\.19\.0/
    );
  });

  it("is an error when no allowed release supports the Next.js version", () => {
    const [finding] = checkNextVersionSupported(
      openNextApp({}, { next: "14.2.5" }),
      ALLOWED_RELEASES
    );
    expect(finding).toMatchObject({
      failureId: "next-version-unsupported",
      severity: "error"
    });
  });

  it("treats a release without a next peer as supporting any Next.js version", () => {
    const releases = [
      ...ALLOWED_RELEASES,
      { version: "1.6.5", supportedNextRange: null }
    ];
    const [finding] = checkNextVersionSupported(
      openNextApp({}, { next: "14.2.5" }),
      releases
    );
    expect(finding).toMatchObject({ severity: "warning" });
    expect(finding?.evidence).toMatch(
      /works only up to @opennextjs\/cloudflare 1\.6\.5/
    );
  });

  it("skips the check without registry data", () => {
    expect(
      checkNextVersionSupported(openNextApp({}, { next: "14.2.5" }), [])
    ).toEqual([]);
  });

  it("skips non-semver ranges such as dist-tags", () => {
    expect(
      checkNextVersionSupported(
        openNextApp({}, { next: "canary" }),
        ALLOWED_RELEASES
      )
    ).toEqual([]);
  });
});

const PROXY = "export function proxy() {}";

function openNextAtVersion(range: string) {
  return snapshotOf({
    "package.json": packageJson({ "@opennextjs/cloudflare": range }),
    "proxy.ts": PROXY
  });
}

describe("checkNativeAddons", () => {
  it("flags a native addon in dependencies", () => {
    expect(
      checkNativeAddons(openNextApp({}, { bcrypt: "^5.1.0" }))[0]?.evidence
    ).toBe("bcrypt is in dependencies");
  });

  it("ignores a native addon used only at build time (devDependencies)", () => {
    const snapshot = snapshotOf({
      "package.json": packageJson({}, { sharp: "^0.35.0" })
    });
    expect(checkNativeAddons(snapshot)).toEqual([]);
  });
});

describe("checkProxyAdapterVersion", () => {
  it("warns when package.json allows an adapter older than 1.20.3", () => {
    expect(
      checkProxyAdapterVersion(openNextAtVersion("^1.19.0"))
    ).toMatchObject([{ file: "proxy.ts" }]);
  });

  it("accepts 1.20.3 and later", () => {
    expect(checkProxyAdapterVersion(openNextAtVersion("^1.20.3"))).toEqual([]);
  });

  it("skips ranges without a version number", () => {
    expect(checkProxyAdapterVersion(openNextAtVersion("latest"))).toEqual([]);
  });

  it("does nothing when there is no proxy file", () => {
    const snapshot = snapshotOf({
      "package.json": packageJson({ "@opennextjs/cloudflare": "^1.0.0" })
    });
    expect(checkProxyAdapterVersion(snapshot)).toEqual([]);
  });
});
