import { describe, expect, it } from "vitest";
import {
  checkEdgeRuntime,
  checkModuleScopeCloudflareContext,
  checkModuleScopeIo
} from "../src/checks/source-code";
import { openNextApp, packageJson, snapshotOf } from "./fixtures";

describe("checkEdgeRuntime", () => {
  const route = 'import x from "y";\nexport const runtime = "edge";\n';

  it("is an error on OpenNext, with file and line", () => {
    const [finding] = checkEdgeRuntime(
      openNextApp({ "app/api/route.ts": route })
    );
    expect(finding).toMatchObject({
      severity: "error",
      file: "app/api/route.ts",
      line: 2
    });
  });

  it("is a warning when no adapter is installed yet", () => {
    const snapshot = snapshotOf({
      "package.json": packageJson(),
      "app/api/route.ts": route
    });
    expect(checkEdgeRuntime(snapshot)[0]?.severity).toBe("warning");
  });

  it("ignores the Node.js runtime", () => {
    const snapshot = openNextApp({
      "app/api/route.ts": 'export const runtime = "nodejs";'
    });
    expect(checkEdgeRuntime(snapshot)).toEqual([]);
  });

  it("ignores a commented-out edge runtime export", () => {
    const snapshot = openNextApp({
      "app/api/route.ts": '// export const runtime = "edge";'
    });
    expect(checkEdgeRuntime(snapshot)).toEqual([]);
  });
});

describe("checkModuleScopeIo", () => {
  it("flags a Prisma client created at module scope", () => {
    const db =
      'import { PrismaClient } from "@prisma/client";\nexport const prisma = new PrismaClient();\n';
    expect(checkModuleScopeIo(openNextApp({ "lib/db.ts": db }))).toMatchObject([
      { file: "lib/db.ts", line: 2 }
    ]);
  });

  it("flags a client whose constructor call continues on the next line", () => {
    const db = "export const sql =\n  postgres(process.env.DATABASE_URL);\n";
    expect(checkModuleScopeIo(openNextApp({ "lib/db.ts": db }))).toHaveLength(
      1
    );
  });

  it("ignores a client created inside a function", () => {
    const db =
      "export function getDb() {\n  return new Pool({ connectionString: url });\n}\n";
    expect(checkModuleScopeIo(openNextApp({ "lib/db.ts": db }))).toEqual([]);
  });

  it("ignores a client created by an arrow function on the same line", () => {
    const db =
      "export const getDb = () => postgres(process.env.DATABASE_URL);\n";
    expect(checkModuleScopeIo(openNextApp({ "lib/db.ts": db }))).toEqual([]);
  });

  it("ignores braces and code-like text inside template literals and comments", () => {
    const db =
      "const doc = `\n{\n`;\n// new PrismaClient()\nconst prisma = new PrismaClient();\n";
    expect(checkModuleScopeIo(openNextApp({ "lib/db.ts": db }))).toMatchObject([
      { line: 5 }
    ]);
  });
});

describe("checkModuleScopeCloudflareContext", () => {
  it("flags the synchronous call at module scope", () => {
    const file = "const { env } = getCloudflareContext();\n";
    expect(
      checkModuleScopeCloudflareContext(openNextApp({ "lib/env.ts": file }))
    ).toHaveLength(1);
  });

  it("accepts the async form", () => {
    const file =
      "const context = await getCloudflareContext({ async: true });\n";
    expect(
      checkModuleScopeCloudflareContext(openNextApp({ "lib/env.ts": file }))
    ).toEqual([]);
  });

  it("accepts the call inside a request handler", () => {
    const file =
      "export async function GET() {\n  const { env } = getCloudflareContext();\n}\n";
    expect(
      checkModuleScopeCloudflareContext(
        openNextApp({ "app/api/route.ts": file })
      )
    ).toEqual([]);
  });
});
