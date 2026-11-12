// Lint rules. Besides the usual checks, these enforce two decisions from
// plans/architecture.md that would otherwise depend on everyone remembering:
//
// 1. Nothing reads the system's clock or random numbers except
//    server/src/system.ts (and, for the IDs the browser makes,
//    web/src/system.ts). Everything else is handed a clock and an ID source
//    (§8), which is what lets tests move time instead of waiting.
// 2. Each part touches only what it is allowed to (§4): shared/ touches
//    nothing, web/ only the API, server/ not the web app.
//
// test/boundaries.test.ts proves these rules are switched on.

import js from "@eslint/js";
import tseslint from "typescript-eslint";

const readsTheSystem = [
  { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: "Don't read the system clock. Use the Clock you were given (plans/architecture.md §8)." },
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: "Don't read the system clock. Use the Clock you were given (plans/architecture.md §8)." },
  { selector: "CallExpression[callee.name='Date']", message: "Don't read the system clock. Use the Clock you were given (plans/architecture.md §8)." },
  { selector: "MemberExpression[object.name='performance'][property.name='now']", message: "Don't read the system clock. Use the Clock you were given (plans/architecture.md §8)." },
  { selector: "MemberExpression[object.name='Math'][property.name='random']", message: "Don't make random numbers here. Use the IdSource you were given (plans/architecture.md §8)." },
  { selector: "MemberExpression[object.name='crypto']", message: "Don't make random numbers here. Use the IdSource you were given (plans/architecture.md §8)." },
];

const node = { group: ["node:*", "fs", "path", "os", "child_process", "crypto", "net", "http", "https"], message: "This part runs in the browser too, so it can't use Node." };
const database = { group: ["pg", "pg-*", "kysely", "embedded-postgres"], message: "Only server/ may touch the database." };
const serverCode = { group: ["@steelman/server", "@steelman/server/*", "**/server/**", "fastify", "fastify/*", "@fastify/*"], message: "Only server/ may use server code. The web app talks to it through the API." };
const webCode = { group: ["@steelman/web", "@steelman/web/*", "**/web/**", "react", "react/*", "react-dom", "react-dom/*"], message: "Only web/ may use the web app's code." };

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "server/test/simulation/.planted/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  {
    files: ["*/src/**"],
    ignores: ["server/src/system.ts", "web/src/system.ts"],
    rules: { "no-restricted-syntax": ["error", ...readsTheSystem] },
  },
  {
    files: ["shared/src/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [node, database, serverCode, webCode] }] },
  },
  {
    files: ["web/src/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [node, database, serverCode] }] },
  },
  {
    files: ["server/src/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [webCode] }] },
  },
);
