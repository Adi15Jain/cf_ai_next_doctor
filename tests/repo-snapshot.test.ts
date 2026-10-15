import { describe, expect, it } from "vitest";
import { RepoNotScannableError } from "../src/checks/repo-snapshot";
import { packageJson, snapshotOf } from "./fixtures";

describe("readRepoSnapshot", () => {
  it("rejects a repository without package.json", () => {
    expect(() => snapshotOf({ "README.md": "# hi" })).toThrow(
      RepoNotScannableError
    );
  });

  it("rejects a package.json that is not JSON", () => {
    expect(() => snapshotOf({ "package.json": "{ nope" })).toThrow(
      /package.json to be parseable/
    );
  });

  it("rejects an app without a next dependency", () => {
    const manifest = JSON.stringify({ dependencies: { react: "19.0.0" } });
    expect(() => snapshotOf({ "package.json": manifest })).toThrow(
      /no "next" dependency/
    );
  });

  it("detects vinext ahead of a next-on-pages leftover", () => {
    const snapshot = snapshotOf({
      "package.json": packageJson(
        {},
        { vinext: "^0.4.0", "@cloudflare/next-on-pages": "^1.13.0" }
      )
    });
    expect(snapshot.adapter).toBe("vinext");
  });

  it("reports no adapter for a plain Next.js app", () => {
    expect(snapshotOf({ "package.json": packageJson() }).adapter).toBe("none");
  });

  it("parses wrangler.jsonc with comments, trailing commas and URLs inside strings", () => {
    const jsonc = `{
      // comment with a "quote"
      "name": "https://example.com/not-a-comment", /* block */
      "compatibility_date": "2025-01-01",
      "compatibility_flags": ["nodejs_compat",],
    }`;
    const wrangler = snapshotOf({
      "package.json": packageJson(),
      "wrangler.jsonc": jsonc
    }).wrangler;
    expect(wrangler?.compatibilityDate).toBe("2025-01-01");
    expect(wrangler?.compatibilityFlags).toEqual(["nodejs_compat"]);
  });

  it("parses wrangler.toml bindings and migrations", () => {
    const toml = [
      'compatibility_date = "2026-10-01"',
      "[[durable_objects.bindings]]",
      'name = "NEXT_CACHE_DO_QUEUE"',
      'class_name = "DOQueueHandler"',
      "[[migrations]]",
      'tag = "v1"',
      'new_sqlite_classes = ["DOQueueHandler"]'
    ].join("\n");
    const wrangler = snapshotOf({
      "package.json": packageJson(),
      "wrangler.toml": toml
    }).wrangler;
    expect(wrangler?.durableObjectClasses).toEqual(["DOQueueHandler"]);
    expect(wrangler?.migratedClasses).toEqual(["DOQueueHandler"]);
  });

  it("prefers wrangler.json over wrangler.toml, as Wrangler does", () => {
    const snapshot = snapshotOf({
      "package.json": packageJson(),
      "wrangler.toml": 'compatibility_date = "2020-01-01"',
      "wrangler.json": '{ "compatibility_date": "2026-10-01" }'
    });
    expect(snapshot.wrangler?.file.path).toBe("wrangler.json");
  });

  it("rejects a malformed wrangler config with the file name in the message", () => {
    expect(() =>
      snapshotOf({ "package.json": packageJson(), "wrangler.toml": "name = " })
    ).toThrow(/wrangler.toml to be parseable/);
  });

  it("keeps only server code in serverFiles", () => {
    const snapshot = snapshotOf({
      "package.json": packageJson(),
      "app/page.tsx": "export default function Page() {}",
      "app/button.tsx": '"use client";\nexport function Button() {}',
      "app/page.test.tsx": "test()",
      "node_modules/pkg/index.js": "x",
      "tailwind.config.ts": "export default {}",
      "env.d.ts": "declare const x: string;"
    });
    expect(snapshot.serverFiles.map((file) => file.path)).toEqual([
      "app/page.tsx"
    ]);
  });
});
