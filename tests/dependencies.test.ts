import { describe, expect, it } from "vitest";
import {
  checkNativeAddons,
  checkProxyAdapterVersion
} from "../src/checks/dependencies";
import { openNextApp, packageJson, snapshotOf } from "./fixtures";

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
