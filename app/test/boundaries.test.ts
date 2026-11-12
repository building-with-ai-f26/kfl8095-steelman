import { ESLint } from "eslint";
import { describe, expect, test } from "vitest";

// These tests run the project's real lint rules against small pieces of code,
// to prove the rules that keep each part inside its limits are switched on
// (plans/architecture.md §4, "How the code is organized").

const eslint = new ESLint();

async function problems(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.message);
}

describe("nothing reads the clock or makes random numbers except server/src/system.ts", () => {
  const reads = [
    ["Date.now()", "export const t = Date.now();\n"],
    ["new Date()", "export const t = new Date();\n"],
    ["Math.random()", "export const r = Math.random();\n"],
    ["crypto", "export const r = crypto.randomUUID();\n"],
  ] as const;

  for (const part of ["shared", "server", "web"]) {
    for (const [name, code] of reads) {
      test(`M0-1: ${part}/ may not use ${name}`, async () => {
        expect(await problems(`${part}/src/example.ts`, code)).not.toEqual([]);
      });
    }
  }

  test("M0-1: server/src/system.ts is the one place that may", async () => {
    const code = "export const t = Date.now();\nexport const d = new Date();\nexport const r = crypto.randomUUID();\n";

    expect(await problems("server/src/system.ts", code)).toEqual([]);
  });

  test("M0-1: turning a number into a date is allowed anywhere", async () => {
    expect(await problems("shared/src/example.ts", "export const d = new Date(1000);\n")).toEqual([]);
  });
});

describe("each part touches only what it is allowed to", () => {
  test("M0-1: shared/ may not use Node", async () => {
    expect(await problems("shared/src/example.ts", 'import { readFileSync } from "node:fs";\nexport { readFileSync };\n')).not.toEqual([]);
  });

  test("M0-1: shared/ may not use the database", async () => {
    expect(await problems("shared/src/example.ts", 'import pg from "pg";\nexport { pg };\n')).not.toEqual([]);
  });

  test("M0-1: shared/ may not use the server or the web app", async () => {
    expect(await problems("shared/src/example.ts", 'export * from "@steelman/server";\n')).not.toEqual([]);
    expect(await problems("shared/src/example.ts", 'export * from "../../web/src/App.tsx";\n')).not.toEqual([]);
  });

  test("M0-1: web/ may not use the server, the database, or Node", async () => {
    expect(await problems("web/src/example.ts", 'export * from "../../server/src/app.ts";\n')).not.toEqual([]);
    expect(await problems("web/src/example.ts", 'import pg from "pg";\nexport { pg };\n')).not.toEqual([]);
    expect(await problems("web/src/example.ts", 'import { readFileSync } from "node:fs";\nexport { readFileSync };\n')).not.toEqual([]);
  });

  test("M0-1: server/ may not use the web app", async () => {
    expect(await problems("server/src/example.ts", 'export * from "../../web/src/App.tsx";\n')).not.toEqual([]);
  });

  test("M0-1: both server/ and web/ may use shared/", async () => {
    const code = 'export type { Clock } from "@steelman/shared";\n';

    expect(await problems("server/src/example.ts", code)).toEqual([]);
    expect(await problems("web/src/example.ts", code)).toEqual([]);
  });
});
