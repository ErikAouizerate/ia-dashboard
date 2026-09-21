#!/usr/bin/env node
// Business-oriented mutation gate.
//
// Stryker's raw score is implementation-coupled: it rewards tests that pin
// internals as much as tests that assert a business rule. This gate reads the
// JSON report of a DOMAIN-SCOPED run and enforces two signals that do track the
// specs:
//   1. the mutation score must not regress below a ratchet floor;
//   2. no domain line may be left unexecuted (NoCoverage) — a NoCoverage mutant
//      is a business rule with no test at all, the only unambiguous gap.
// Surviving mutants are printed for triage (missing rule test / equivalent
// mutant / out of scope); they are not a failure by themselves.
//
// Usage: node scripts/check-mutation.mjs <report.json> --min-score 75 --max-nocov 0
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const reportPath = args[0];
const readFlag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : Number(args[i + 1]);
};
const minScore = readFlag("--min-score") ?? 0;
const maxNoCoverage = readFlag("--max-nocov") ?? 0;

if (!reportPath) {
  console.error("usage: check-mutation.mjs <report.json> [--min-score N] [--max-nocov N]");
  process.exit(2);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
let killed = 0;
let timeout = 0;
let survived = 0;
let noCoverage = 0;
let runtimeError = 0;
let compileError = 0;
const gaps = [];
const survivors = [];

for (const [file, data] of Object.entries(report.files ?? {})) {
  for (const m of data.mutants) {
    const at = `${file}:${m.location.start.line}`;
    switch (m.status) {
      case "Killed": killed++; break;
      case "Timeout": timeout++; break;
      case "Survived": survived++; survivors.push(`${at} [${m.mutatorName}]`); break;
      case "NoCoverage": noCoverage++; gaps.push(at); break;
      case "RuntimeError": runtimeError++; break;
      default: compileError++; // CompileError: invalid mutant, excluded from the score
    }
  }
}

const denominator = killed + timeout + survived + noCoverage + runtimeError;
const score = denominator ? (100 * (killed + timeout)) / denominator : 100;

console.log(
  `[mutation] score ${score.toFixed(2)}% (floor ${minScore}%) | killed ${killed} | ` +
    `survived ${survived} | no-coverage ${noCoverage} (budget ${maxNoCoverage}) | ` +
    `runtime-error ${runtimeError} | compile-error(ignored) ${compileError}`,
);
if (survivors.length) {
  console.log(`[mutation] ${survivors.length} surviving mutant(s) to triage:`);
  for (const s of survivors) console.log(`  - ${s}`);
}

let failed = false;
if (score < minScore) {
  console.error(`[mutation] FAIL: score ${score.toFixed(2)}% < floor ${minScore}%`);
  failed = true;
}
if (noCoverage > maxNoCoverage) {
  console.error(
    `[mutation] FAIL: ${noCoverage} no-coverage mutant(s) > budget ${maxNoCoverage} — business line(s) with no test:`,
  );
  for (const g of gaps) console.error(`  - ${g}`);
  failed = true;
}
process.exit(failed ? 1 : 0);
