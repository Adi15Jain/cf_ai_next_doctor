import { describe, expect, it } from "vitest";
import { checkDevInit, checkWorkerdPackages } from "../src/checks/next-config";
import { openNextApp, packageJson, snapshotOf } from "./fixtures";

const WITH_DEV_INIT = `import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
export default {};`;

const READS_BINDINGS =
  "export async function GET() {\n  const { env } = getCloudflareContext();\n}";

describe("checkDevInit", () => {
  it("flags code that reads bindings while next.config skips initOpenNextCloudflareForDev()", () => {
    const [finding] = checkDevInit(
      openNextApp({
        "next.config.ts": "export default {};",
        "app/api/route.ts": READS_BINDINGS
      })
    );
    expect(finding).toMatchObject({
      failureId: "dev-init-missing",
      file: "next.config.ts"
    });
    expect(finding?.evidence).toMatch(
      /^app\/api\/route.ts calls getCloudflareContext\(\)/
    );
  });

  it("accepts a next.config that calls it", () => {
    expect(
      checkDevInit(
        openNextApp({
          "next.config.ts": WITH_DEV_INIT,
          "app/api/route.ts": READS_BINDINGS
        })
      )
    ).toEqual([]);
  });

  it("does not count a commented-out initOpenNextCloudflareForDev()", () => {
    const [finding] = checkDevInit(
      openNextApp({
        "next.config.ts":
          "// initOpenNextCloudflareForDev();\nexport default {};",
        "app/api/route.ts": READS_BINDINGS
      })
    );
    expect(finding?.failureId).toBe("dev-init-missing");
  });

  it("does not count a commented-out getCloudflareContext() as reading bindings", () => {
    expect(
      checkDevInit(
        openNextApp({
          "next.config.ts": "export default {};",
          "app/api/route.ts": "// const { env } = getCloudflareContext();"
        })
      )
    ).toEqual([]);
  });

  it("stays quiet when no code reads bindings", () => {
    expect(
      checkDevInit(openNextApp({ "next.config.ts": "export default {};" }))
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
