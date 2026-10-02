import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { validateCanonicalDocument, validateDocumentResourceBudget } from "@timing-chart-v2/schema";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../samples/performance");
const cases = [
  { file: "perf_100x500_full_span.tcd.json", id: "perf.100x500", title: "Fixed 100 Signal × 500 Cycle full-span benchmark", signals: 100, cycles: 500, profile: "standard" },
  { file: "perf_1000x1000_virtualized.tcd.json", id: "perf.1000x1000", title: "Virtualized 1,000 Signal × 1,000 Cycle benchmark", signals: 1_000, cycles: 1_000, profile: "mixed" },
  { file: "perf_100x100000_sparse_timeline.tcd.json", id: "perf.100x100000", title: "Sparse 100 Signal × 100,000 Cycle timeline benchmark", signals: 100, cycles: 100_000, profile: "standard" },
];

await mkdir(root, { recursive: true });
for (const item of cases) {
  const document = generatePerformanceDocument({ signalCount: item.signals, cycleCount: item.cycles, profile: item.profile });
  document.document.title = item.title;
  const problems = [...validateCanonicalDocument(document), ...validateDocumentResourceBudget(document)];
  if (problems.length) throw new Error(`${item.file} invalid:\n${problems.map((problem) => `${problem.path}: ${problem.message}`).join("\n")}`);
  await writeFile(path.join(root, item.file), `${JSON.stringify(document, null, 2)}\n`, "utf8");
  console.log(`${item.file}: signals=${document.signals.length}, cycles=${document.timeline.cycleCount}, values=${document.signals.reduce((sum, signal) => sum + ("values" in signal ? signal.values.length : 0), 0)}, annotations=${document.annotations.length}, transactions=${document.transactions.length}, validated`);
}
