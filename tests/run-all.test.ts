import { describe, expect, it } from "vitest";
import { runAllChecks } from "../src/checks/run-all";
import { openNextApp, wranglerJsonc } from "./fixtures";

describe("runAllChecks", () => {
  it("returns nothing for a correctly configured OpenNext app", () => {
    const snapshot = openNextApp({
      "next.config.ts":
        'import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";\ninitOpenNextCloudflareForDev();',
      "wrangler.jsonc": wranglerJsonc({ compatibility_date: "2026-10-14" }),
      "app/page.tsx": "export default function Page() { return null; }"
    });
    expect(runAllChecks(snapshot, [])).toEqual([]);
  });

  it("orders errors before warnings", () => {
    const snapshot = openNextApp(
      {
        "app/api/route.ts": 'export const runtime = "edge";',
        "lib/db.ts": "const prisma = new PrismaClient();"
      },
      { sharp: "^0.35.0" }
    );
    const severities = runAllChecks(snapshot, []).map(
      (finding) => finding.severity
    );
    expect(severities).toEqual([...severities].sort());
    expect(severities[0]).toBe("error");
  });
});
