import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const cli = resolve(root, "node_modules/@playwright/test/cli.js");
const outputPath = resolve(root, process.argv[2] ?? "qa/test-suite-inventory.json");
const markdownPath = resolve(root, "docs/TEST_SUITE_INVENTORY.md");
const reviewPath = resolve(root, "qa/test-suite-review.json");
const baselinePath = resolve(root, "qa/test-inventory-baseline.json");
const consolidationPath = resolve(root, "qa/test-consolidation-map.json");

const result = spawnSync(process.execPath, [cli, "test", "--list", "--reporter=json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
});

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const report = JSON.parse(result.stdout);
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const consolidationMap = JSON.parse(readFileSync(consolidationPath, "utf8"));
const reviewManifest = existsSync(reviewPath) ? JSON.parse(readFileSync(reviewPath, "utf8")) : { reviews: [], specReviews: [] };
const curatedReviews = reviewManifest.reviews ?? [];
const specReviews = reviewManifest.specReviews ?? [];
const reviewsByKey = new Map(curatedReviews.map((review) => [`${review.file}\n${review.title}`, review]));
if (reviewsByKey.size !== curatedReviews.length) throw new Error("Duplicate file/title key in qa/test-suite-review.json.");
const reviewsByFile = new Map(specReviews.map((review) => [review.file, review]));
if (reviewsByFile.size !== specReviews.length) throw new Error("Duplicate file-level review in qa/test-suite-review.json.");
const matchedReviewKeys = new Set();
const matchedSpecReviews = new Set();
const cases = [];

function visit(suites, file = "", suitePath = []) {
  for (const suite of suites ?? []) {
    const suiteFile = suite.file || file;
    const childSuitePath = suiteFile && suite.title === suiteFile ? suitePath : [...suitePath, suite.title];
    for (const spec of suite.specs ?? []) {
      const normalizedFile = (spec.file || suiteFile).replaceAll("\\", "/");
      for (const test of spec.tests ?? []) {
        const record = {
          file: normalizedFile,
          suitePath: childSuitePath,
          line: spec.line,
          title: spec.title,
          project: test.projectName,
          timeoutMs: test.timeout,
          tags: spec.tags ?? [],
          annotations: test.annotations ?? [],
          domain: null,
          originIssue: null,
          type: null,
          costClass: null,
          measuredRuntimeMs: null,
          primaryContract: null,
          duplicateGroup: null,
          executionTier: null,
          decision: "UNREVIEWED",
          reason: "Inventory record generated from Playwright collection; classify from the test's protected product invariant before changing coverage.",
          replacementTest: null,
          reviewStatus: "UNREVIEWED",
        };
        const review = reviewsByKey.get(`${record.file}\n${record.title}`);
        const specReview = reviewsByFile.get(record.file);
        if (review || specReview) {
          if (specReview) matchedSpecReviews.add(record.file);
          const selectedReview = review ?? specReview;
          if (review) matchedReviewKeys.add(`${record.file}\n${record.title}`);
          Object.assign(record, selectedReview, { file: record.file, title: record.title, suitePath: childSuitePath, line: spec.line, reviewStatus: "REVIEWED" });
        }
        cases.push(record);
      }
    }
    visit(suite.suites, suiteFile, childSuitePath);
  }
}

visit(report.suites);
const missingReviewKeys = [...reviewsByKey.keys()].filter((key) => !matchedReviewKeys.has(key));
if (missingReviewKeys.length) throw new Error(`Curated test reviews no longer match Playwright collection:\n${missingReviewKeys.join("\n")}`);
const missingSpecReviewFiles = [...reviewsByFile.keys()].filter((file) => !matchedSpecReviews.has(file));
if (missingSpecReviewFiles.length) throw new Error(`File-level reviews no longer match Playwright collection:\n${missingSpecReviewFiles.join("\n")}`);
cases.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.title.localeCompare(b.title));
const caseKeys = new Set(cases.map((test) => `${test.file}\n${test.title}`));
for (const item of consolidationMap.consolidations) {
  const fromKey = `${item.from.file}\n${item.from.title}`;
  const toKey = `${item.to.file}\n${item.to.title}`;
  if (caseKeys.has(fromKey)) throw new Error(`Consolidated source test still exists: ${item.from.file} — ${item.from.title}`);
  if (!caseKeys.has(toKey)) throw new Error(`Consolidated replacement test is missing: ${item.to.file} — ${item.to.title}`);
}

const fileAudit = new Map();
for (const file of new Set(cases.map((test) => test.file))) {
  const sourcePath = resolve(root, "tests/e2e", file);
  const source = readFileSync(sourcePath, "utf8");
  const fileCases = cases.filter((test) => test.file === file);
  const reviewedCaseCount = fileCases.filter((test) => test.reviewStatus === "REVIEWED").length;
  const signals = {
    querySelector: /\.querySelector(?:All)?\s*\(/.test(source),
    getComputedStyle: /getComputedStyle\s*\(/.test(source),
    elementContains: /\.contains\s*\(/.test(source),
    dataset: /\.dataset\b|\["data-[^"]+"\]/.test(source),
    styleMutation: /\.style\.setProperty\s*\(|\.style\.[\w]+\s*=/.test(source),
    directDomMutation: /\.append(?:Child)?\s*\(|\.remove\s*\(|\.replaceChildren\s*\(/.test(source),
    geometryRead: /getBoundingClientRect\s*\(/.test(source),
    explicitWait: /waitForTimeout\s*\(/.test(source),
  };
  fileAudit.set(file, {
    file,
    caseCount: fileCases.length,
    reviewedCaseCount,
    originIssue: file.match(/(?:issue|acceptance)-(\d+)/i)?.[1] ?? null,
    declaredTimeoutMs: [...source.matchAll(/(?:setTimeout|timeout)\s*[:=(]\s*(\d+)/g)].map((match) => Number(match[1])).sort((a, b) => b - a)[0] ?? null,
    candidateSignals: Object.entries(signals).filter(([, present]) => present).map(([signal]) => signal),
    semanticReviewStatus: reviewedCaseCount === 0 ? "UNREVIEWED" : reviewedCaseCount === fileCases.length ? "REVIEWED" : "PARTIAL",
  });
}

const byTitle = new Map();
for (const test of cases) {
  const normalized = test.title.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
  const cluster = byTitle.get(normalized) ?? [];
  cluster.push(test);
  byTitle.set(normalized, cluster);
}
const duplicateGroups = [...byTitle.entries()]
  .filter(([, members]) => members.length > 1 && new Set(members.map((member) => member.file)).size > 1)
  .map(([normalizedTitle, members], index) => ({
    id: `exact-title-${index + 1}`,
    normalizedTitle,
    members: members.map(({ file, line, title }) => ({ file, line, title })),
    reviewStatus: "CANDIDATE_REQUIRES_SEMANTIC_REVIEW",
  }));
const stopWords = new Set("the and for with from into when that this after before stays keeps does not should must to of a an in on at as is be are its by only same no".split(" "));
const titleTokens = cases.map((test) => new Set(test.title.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").split(" ").filter((word) => word.length > 2 && !stopWords.has(word))));
const similarTitleCandidates = [];
for (let left = 0; left < cases.length; left += 1) {
  for (let right = left + 1; right < cases.length; right += 1) {
    if (cases[left].file === cases[right].file) continue;
    const a = titleTokens[left];
    const b = titleTokens[right];
    if (Math.min(a.size, b.size) < 5) continue;
    let intersection = 0;
    for (const token of a) if (b.has(token)) intersection += 1;
    const similarity = intersection / (a.size + b.size - intersection);
    if (similarity >= 0.68) {
      const leftTest = cases[left];
      const rightTest = cases[right];
      const reviewedTogether = leftTest.reviewStatus === "REVIEWED" && rightTest.reviewStatus === "REVIEWED";
      similarTitleCandidates.push({
        similarity: Number(similarity.toFixed(2)),
        left: { file: leftTest.file, line: leftTest.line, title: leftTest.title },
        right: { file: rightTest.file, line: rightTest.line, title: rightTest.title },
        reviewStatus: reviewedTogether ? "REVIEWED" : "CANDIDATE_REQUIRES_SEMANTIC_REVIEW",
        disposition: reviewedTogether ? (leftTest.duplicateGroup && leftTest.duplicateGroup === rightTest.duplicateGroup ? "SAME_DUPLICATE_CLUSTER" : "DISTINCT_CONTRACTS") : null,
      });
    }
  }
}
similarTitleCandidates.sort((a, b) => b.similarity - a.similarity || a.left.file.localeCompare(b.left.file));

const inventory = {
  generatedAt: new Date().toISOString(),
  source: "Playwright test --list --reporter=json; no tests were executed",
  playwrightVersion: report.config?.version ?? null,
  baseline,
  specFileCount: new Set(cases.map((test) => test.file)).size,
  caseCount: cases.length,
  reviewedCaseCount: cases.filter((test) => test.reviewStatus === "REVIEWED").length,
  curatedProfileCounts: Object.fromEntries([...new Set(cases.flatMap((test) => test.profiles ?? []))].sort().map((profile) => [profile, cases.filter((test) => test.profiles?.includes(profile)).length])),
  reviewPolicy: "UNREVIEWED entries are not acceptance-complete classifications. Curated records live in qa/test-suite-review.json and are joined by file + exact title; set reviewStatus to REVIEWED only after reading the test and mapping its invariant.",
  tests: cases,
  fileAudit: [...fileAudit.values()].sort((a, b) => a.file.localeCompare(b.file)),
  duplicateTitleCandidates: duplicateGroups,
  similarTitleCandidates,
  consolidationMap: consolidationMap.consolidations,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);
const fileCounts = new Map();
for (const test of cases) {
  const counts = fileCounts.get(test.file) ?? { total: 0, reviewed: 0 };
  counts.total += 1;
  if (test.reviewStatus === "REVIEWED") counts.reviewed += 1;
  fileCounts.set(test.file, counts);
}
const slowestMeasuredCases = cases
  .filter((test) => Number.isFinite(test.measuredRuntimeMs))
  .sort((a, b) => b.measuredRuntimeMs - a.measuredRuntimeMs || a.file.localeCompare(b.file))
  .slice(0, 20);
const markdown = [
  "# Playwright test inventory",
  "",
  `Generated from Playwright collection (${inventory.playwrightVersion}); ${inventory.specFileCount} spec files and ${inventory.caseCount} test cases. Collection does not execute tests.`,
  `Baseline ${inventory.baseline.commit}: ${inventory.baseline.specFileCount} spec files / ${inventory.baseline.caseCount} cases. Full-profile wall time and aggregate percentiles: not measured.`,
  `Semantic review progress: ${inventory.reviewedCaseCount}/${inventory.caseCount} cases reviewed.`,
  "",
  "## Curated profile membership",
  "",
  "These counts include only explicitly reviewed cases; unreviewed cases are not silently assigned to a profile.",
  "",
  "| Profile | Reviewed cases |",
  "| --- | ---: |",
  ...Object.entries(inventory.curatedProfileCounts).map(([profile, count]) => `| \`${profile}\` | ${count} |`),
  "",
  "## Top recorded per-case runtimes",
  "",
  "These are the highest non-null `measuredRuntimeMs` values already recorded in the curated manifest. Inventory generation does not execute tests or refresh these measurements; treat them as case-level observations, not a full-profile runtime baseline.",
  "",
  "| Runtime (ms) | Profile | Spec file | Test case |",
  "| ---: | --- | --- | --- |",
  ...slowestMeasuredCases.map((test) => `| ${test.measuredRuntimeMs} | ${(test.profiles ?? []).map((profile) => `\`${profile}\``).join(", ") || "—"} | \`${test.file}\` | ${test.title.replaceAll("|", "\\|")} |`),
  "",
  "> This is a complete name/location inventory, not a completed semantic review. Per-file counts show reviewed/total cases; remaining cases stay `UNREVIEWED` until their product invariant, layer, cost, tier, decision, and replacement mapping (if any) have been reviewed in the JSON manifest.",
  "",
  "| Spec file | Cases | Review status |",
  "| --- | ---: | --- |",
  ...[...fileCounts].sort(([a], [b]) => a.localeCompare(b)).map(([file, counts]) => `| \`${file}\` | ${counts.total} | ${counts.reviewed}/${counts.total} reviewed |`),
  "",
  "## Static review candidates",
  "",
  "The following source-pattern signals are triage hints only; they do not prove that a test is invalid or implementation-coupled. Inspect the case and protected contract before deciding.",
  "",
  "| Spec file | Candidate signals |",
  "| --- | --- |",
  ...[...fileAudit.values()].filter((entry) => entry.candidateSignals.length > 0).sort((a, b) => a.file.localeCompare(b.file)).map((entry) => `| \`${entry.file}\` | ${entry.candidateSignals.join(", ")} |`),
  "",
  "## Exact-title duplicate candidates",
  "",
  duplicateGroups.length ? duplicateGroups.map((group) => `- **${group.normalizedTitle}** (${group.members.length} cases): ${group.members.map((member) => `\`${member.file}:${member.line}\``).join(", ")}`).join("\n") : "No exact normalized cross-file title duplicates found.",
  "",
  "## Similar-title candidates",
  "",
  "Title similarity is only a discovery heuristic. It does not establish duplicate coverage; review the setup, assertions, and protected invariant before merging or moving tests.",
  "",
  similarTitleCandidates.length ? similarTitleCandidates.map((pair) => `- **${pair.similarity}**${pair.reviewStatus === "REVIEWED" ? ` — ${pair.disposition}` : " — requires semantic review"}: \`${pair.left.file}:${pair.left.line}\` “${pair.left.title}” ↔ \`${pair.right.file}:${pair.right.line}\` “${pair.right.title}”`).join("\n") : "No similar-title candidates found.",
  "",
  "## Consolidation/replacement map",
  "",
  ...consolidationMap.consolidations.map((item) => `- \`${item.from.file}\` “${item.from.title}” → \`${item.to.file}\` “${item.to.title}”. **Invariant:** ${item.protectedInvariant} **Reason:** ${item.reason}`),
  "",
  "Per-case titles, source lines, project, timeout, tags, annotations, and classification fields are in [`qa/test-suite-inventory.json`](../qa/test-suite-inventory.json). Curated classifications are maintained in [`qa/test-suite-review.json`](../qa/test-suite-review.json) so regeneration does not erase review work.",
  "",
  "Regenerate with `npm run test:inventory` after installing workspace dependencies.",
  "",
].join("\n");
mkdirSync(dirname(markdownPath), { recursive: true });
writeFileSync(markdownPath, markdown);
console.log(`Wrote ${cases.length} test cases from ${inventory.specFileCount} spec files to ${outputPath}`);
