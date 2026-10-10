import { describe, expect, it } from "vitest";
import { buildExportScene, renderExportSvg } from "@timing-chart-v2/export";
import type { CanonicalDocument, TransactionGroupId, TransactionId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const MEMORY = "grp_memory" as TransactionGroupId;
const CPU = "grp_cpu" as TransactionGroupId;

function documentWithGroups(extra: { cpuColor?: string; memoryColor?: string } = {}): CanonicalDocument {
  const base = canonicalFixture();
  return {
    ...base,
    transactionGroups: [
      { id: CPU, name: "CPU", order: 0, ...(extra.cpuColor === undefined ? {} : { color: extra.cpuColor }) },
      { id: MEMORY, name: "Memory", order: 1, ...(extra.memoryColor === undefined ? {} : { color: extra.memoryColor }) },
    ],
    transactions: [
      { id: "txn_mem" as TransactionId, name: "Mem", start: 0, end: 2, laneId: "lane_0", groupId: MEMORY },
      { id: "txn_cpu" as TransactionId, name: "Cpu", start: 0, end: 2, laneId: "lane_0", groupId: CPU },
      { id: "txn_cpu_own" as TransactionId, name: "CpuOwn", start: 3, end: 5, laneId: "lane_0", groupId: CPU, color: "#00ff00" },
      { id: "txn_plain" as TransactionId, name: "Plain", start: 0, end: 2, laneId: "lane_0" },
    ],
  } as CanonicalDocument;
}

describe("transaction export keys lanes by Transaction Group", () => {
  it("exports lane_0 of two different Groups as two separate rows, ordered by Group order", () => {
    const scene = buildExportScene(documentWithGroups(), { format: "svg", scope: "document" });
    const yOf = (id: string) => scene.transactions.find((transaction) => transaction.id === id)!.y;
    // CPU (order 0) precedes Memory (order 1); the ungrouped lane comes last.
    expect(yOf("txn_cpu")).toBe(yOf("txn_cpu_own"));
    expect(yOf("txn_cpu")).not.toBe(yOf("txn_mem"));
    expect(yOf("txn_cpu")).toBeLessThan(yOf("txn_mem"));
    expect(yOf("txn_mem")).toBeLessThan(yOf("txn_plain"));
  });

  it("follows transaction color, then group color, then the #dbeafe default", () => {
    const scene = buildExportScene(documentWithGroups({ cpuColor: "#ff0000", memoryColor: "#0000ff" }), { format: "svg", scope: "document" });
    const fillOf = (id: string) => scene.transactions.find((transaction) => transaction.id === id)!.fill;
    expect(fillOf("txn_cpu_own")).toBe("#00ff00");
    expect(fillOf("txn_cpu")).toBe("#ff0000");
    expect(fillOf("txn_mem")).toBe("#0000ff");
    expect(fillOf("txn_plain")).toBe("#dbeafe");
  });

  it("writes the resolved fill into the SVG rect and escapes hostile color values", () => {
    const hostile = documentWithGroups({ cpuColor: '#ff0000" onload="alert(1)' });
    const svg = renderExportSvg(buildExportScene(hostile, { format: "svg", scope: "document" }));
    expect(svg).toContain('fill="#ff0000&quot; onload=&quot;alert(1)"');
    expect(svg).not.toContain('onload="alert(1)"');
    const plain = renderExportSvg(buildExportScene(documentWithGroups({ cpuColor: "#ff0000" }), { format: "svg", scope: "document" }));
    expect(plain).toMatch(/data-transaction-id="txn_cpu"[^]*?fill="#ff0000"/);
    expect(plain).toMatch(/data-transaction-id="txn_plain"[^]*?fill="#dbeafe"/);
  });
});
