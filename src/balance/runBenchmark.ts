import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadScenario } from "../data/loaders/loadScenario.js";
import {
  balanceBenchmarkToCsv,
  formatBalanceSummary,
  runBalanceBenchmark,
  type BalanceStrategyId,
} from "./benchmark.js";

interface CliOptions {
  seedStart: number;
  seedCount: number;
  format: "summary" | "json" | "csv" | "both";
  outputBase: string;
  strict: boolean;
  strategyIds?: BalanceStrategyId[];
}

function optionValue(argument: string, name: string): string | undefined {
  const prefix = `--${name}=`;
  return argument.startsWith(prefix) ? argument.slice(prefix.length) : undefined;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function integer(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

function parseOptions(arguments_: readonly string[]): CliOptions {
  const seedStart = integer(
    arguments_.map((argument) => optionValue(argument, "seed-start")).find(Boolean),
    1,
    "seed-start",
  );
  const seedCount = positiveInteger(
    arguments_.map((argument) => optionValue(argument, "seeds")).find(Boolean),
    100,
    "seeds",
  );
  const formatValue =
    arguments_.map((argument) => optionValue(argument, "format")).find(Boolean) ?? "both";
  if (!["summary", "json", "csv", "both"].includes(formatValue)) {
    throw new Error("format must be summary, json, csv, or both");
  }
  const outputBase =
    arguments_.map((argument) => optionValue(argument, "out")).find(Boolean) ??
    "artifacts/balance/balance-benchmark";
  const strategyValue = arguments_
    .map((argument) => optionValue(argument, "strategies"))
    .find(Boolean);
  const strategyIds = strategyValue
    ? (strategyValue.split(",").filter(Boolean) as BalanceStrategyId[])
    : undefined;
  return {
    seedStart,
    seedCount,
    format: formatValue as CliOptions["format"],
    outputBase,
    strict: arguments_.includes("--strict"),
    ...(strategyIds ? { strategyIds } : {}),
  };
}

function writeOutput(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

export function runBenchmarkCli(arguments_: readonly string[]): number {
  const options = parseOptions(arguments_);
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const scenario = loadScenario(resolve(projectRoot, "data/scenarios/vertical_slice_30d.json"));
  const report = runBalanceBenchmark(scenario, {
    seedStart: options.seedStart,
    seedCount: options.seedCount,
    ...(options.strategyIds ? { strategyIds: options.strategyIds } : {}),
  });

  console.log(formatBalanceSummary(report));
  if (options.format === "json" || options.format === "both") {
    const path = resolve(projectRoot, `${options.outputBase}.json`);
    writeOutput(path, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`JSON: ${path}`);
  }
  if (options.format === "csv" || options.format === "both") {
    const path = resolve(projectRoot, `${options.outputBase}.csv`);
    writeOutput(path, `${balanceBenchmarkToCsv(report)}\n`);
    console.log(`CSV: ${path}`);
  }
  return options.strict && !report.assessment.passesMilestone ? 2 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runBenchmarkCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
