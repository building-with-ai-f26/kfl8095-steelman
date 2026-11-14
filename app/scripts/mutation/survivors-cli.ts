// Prints the mutation report as Markdown and exits 1 when any break went
// unnoticed. Used by the nightly workflow (.github/workflows/nightly.yml).
//
//   npx tsx scripts/mutation/survivors-cli.ts [reports/mutation/mutation.json]   (from app/)

import { readFileSync } from "node:fs";
import process from "node:process";
import { asMarkdown, readReport } from "./survivors.ts";

const path = process.argv[2] ?? "reports/mutation/mutation.json";
const summary = readReport(JSON.parse(readFileSync(path, "utf8")));
process.stdout.write(asMarkdown(summary));
process.exitCode = summary.survivors.length > 0 ? 1 : 0;
