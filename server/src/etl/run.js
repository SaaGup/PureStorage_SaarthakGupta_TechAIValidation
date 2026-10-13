// Entry point: node src/etl/run.js
// Reads data/raw/*.csv (read-only) and writes everything to data/processed/.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, toCsv } from "./csv.js";
import { cleanRows, summariseReports } from "./clean.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const rawPath = path.join(root, "data/raw/pure_insights_monitoring.csv");
const outDir = path.join(root, "data/processed");
const docsDir = path.join(root, "docs");

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });

const raw = parseCsv(fs.readFileSync(rawPath, "utf8"));
const { clean, rejected, log, totals } = cleanRows(raw);
const reports = summariseReports(clean);

const cleanCols = Object.keys(clean[0]);
fs.writeFileSync(path.join(outDir, "observations.csv"), toCsv(clean, cleanCols));
fs.writeFileSync(path.join(outDir, "observations.json"), JSON.stringify(clean));
fs.writeFileSync(path.join(outDir, "reports.json"), JSON.stringify(reports, null, 2));
fs.writeFileSync(path.join(outDir, "reports.csv"), toCsv(reports, Object.keys(reports[0])));

const rejCols = rejected.length ? Object.keys(rejected[0]) : ["source_row", "rule", "detail"];
fs.writeFileSync(path.join(outDir, "rejected_rows.csv"), toCsv(rejected, rejCols));

const qualityLog = { generated_by: "server/src/etl/run.js", totals, rules: log };
fs.writeFileSync(path.join(outDir, "data_quality_log.json"), JSON.stringify(qualityLog, null, 2));

const creditsExcluded = rejected.filter((r) => r.rule === "R4").reduce((a, r) => a + Number(r.snowflake_credits_consumed), 0);
const md = [
  "# Data Quality Log",
  "",
  "Generated automatically by `npm run etl`. Raw data in `data/raw/` is never modified.",
  "",
  `- Input rows: **${totals.input}**`,
  `- Clean rows kept: **${totals.clean}**`,
  `- Rows quarantined: **${totals.quarantined}** (see \`data/processed/rejected_rows.csv\`)`,
  `- Credits excluded by quarantine rule R4: **${creditsExcluded.toFixed(2)}**`,
  `- Distinct reports: **${reports.length}**`,
  "",
  "| Rule | Issue | Detected in raw | Rows affected | Action | Why |",
  "|---|---|---:|---:|---|---|",
  ...log.map((r) => `| ${r.id} | ${r.title} | ${r.detected_in_raw} | ${r.rows_affected} | ${r.action} | ${r.why} |`),
  "",
  "Rules R2, R6, R7 and R9 *flag* rows that stay in the dataset. All other rules *quarantine* rows.",
  "",
  "**Detected in raw** counts every raw row showing the issue. **Rows affected** is what the rule did. They differ for flag rules because a row is quarantined once, by the first rule it fails, and is then not flagged (e.g. 3 orphaned rows also had negative credits, so they sit in quarantine under R4).",
  "",
].join("\n");
fs.writeFileSync(path.join(docsDir, "DATA_QUALITY_LOG.md"), md);

console.log(md);