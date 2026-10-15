import { describe, expect, it } from "vitest";
import { checkDevInit, checkWorkerdPackages } from "../src/checks/next-config";
import { openNextApp, packageJson, snapshotOf } from "./fixtures";

const WITH_DEV_INIT = `import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
export default {};`;

describe("checkDevInit", () => {
  it("flags a next.config that never calls initOpenNextCloudflareForDev()", () => {
    const [finding] = checkDevInit(
      openNextApp({ "next.config.ts": "export default {};" })
    );
    expect(finding).toMatchObject({
      failureId: "dev-init-missing",
      file: "next.config.ts"
    });
  });

  it("accepts a next.config that calls it", () => {
    expect(
      checkDevInit(openNextApp({ "next.config.ts": WITH_DEV_INIT }))
    ).toEqual([]);
  });

  it("does not apply without OpenNext", () => {
    expect(checkDevInit(snapshotOf({ "package.json": packageJson() }))).toEqual(
      []
    );
  });
});

describe("checkWorkerdPackages", () => {
  it("flags a workerd-specific package missing from serverExternalPackages", () => {
    const snapshot = openNextApp(
      { "next.config.ts": WITH_DEV_INIT },
      { postgres: "^3.4.0" }
    );
    expect(checkWorkerdPackages(snapshot)[0]?.evidence).toMatch(
      /postgres is a dependency/
    );
  });

  it("accepts the package when it is listed", () => {
    const config = 'export default { serverExternalPackages: ["postgres"] };';
    expect(
      checkWorkerdPackages(
        openNextApp({ "next.config.ts": config }, { postgres: "^3.4.0" })
      )
    ).toEqual([]);
  });

  it("requires .prisma/client alongside @prisma/client", () => {
    const config =
      "export default { serverExternalPackages: ['@prisma/client'] };";
    const [finding] = checkWorkerdPackages(
      openNextApp({ "next.config.ts": config }, { "@prisma/client": "^6.0.0" })
    );
    expect(finding?.evidence).toMatch(/lacks \.prisma\/client$/);
  });
});
