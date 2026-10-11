import { describe, expect, it } from "vitest";
import type { VcdTimescale } from "@timing-chart-v2/projection";
import { parseVcdText } from "../../apps/editor/src/simulation/vcd-text-parser.js";

async function* chunks(...parts: string[]): AsyncGenerator<string> {
  for (const part of parts) yield part;
}

describe("parseVcdText", () => {
  it("parses header, hierarchy, split tokens, timestamps and scalar/vector 4-state changes incrementally", async () => {
    const result = await parseVcdText(chunks(
      "$date today $end $comment arbitrary comment text $end\n",
      "$version test $end $timescale 10",
      "ps $end $scope module top $end $scope module cpu $end\n",
      "$var wire 1 ! clk $end $var reg 4 \" bus [3:0] $end $upscope $end $upscope $end ",
      "$enddefinitions $end #0 $dumpvars 0! b10",
      "xz \" $end #900719925474099312345 1!\n#900719925474099312346 b01xz \"",
    ));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const timescale: VcdTimescale = { magnitude: 10n, unit: "ps" };
    expect(result.value.timescale).toEqual(timescale);
    expect(result.value.variables).toEqual([
      { code: "!", kind: "wire", width: 1, reference: "clk", scope: ["top", "cpu"], hierarchicalName: "top.cpu.clk" },
      { code: "\"", kind: "reg", width: 4, reference: "bus", scope: ["top", "cpu"], hierarchicalName: "top.cpu.bus" },
    ]);
    expect(result.value.changes).toEqual([
      { timestamp: 0n, code: "!", kind: "scalar", value: "0" },
      { timestamp: 0n, code: "\"", kind: "vector", value: "10xz" },
      { timestamp: 900719925474099312345n, code: "!", kind: "scalar", value: "1" },
      { timestamp: 900719925474099312346n, code: "\"", kind: "vector", value: "01xz" },
    ]);
  });

  it("accepts compact timescale and compact value-change tokens", async () => {
    const result = await parseVcdText(chunks(
      "$timescale 1ns $end $scope module m $end $var wire 1 ! q $end $upscope $end $enddefinitions $end #0 1!",
    ));
    expect(result).toMatchObject({ ok: true, value: { timescale: { magnitude: 1n, unit: "ns" }, changes: [{ code: "!", value: "1" }] } });
  });

  it.each([
    ["missing timescale", "$scope module m $end $upscope $end $enddefinitions $end", "malformed"],
    ["unbalanced scope", "$timescale 1ns $end $scope module m $end $enddefinitions $end", "malformed"],
    ["unknown identifier", "$timescale 1ns $end $enddefinitions $end #0 1!", "malformed"],
    ["unsupported real change", "$timescale 1ns $end $scope module m $end $var real 1 ! q $end $upscope $end $enddefinitions $end #0 r1.25 !", "unsupported"],
    ["unsupported FST marker", "$fst", "unsupported"],
    ["nonmonotonic timestamp", "$timescale 1ns $end $scope module m $end $var wire 1 ! q $end $upscope $end $enddefinitions $end #2 1! #1 0!", "malformed"],
  ] as const)("rejects %s with a structured error", async (_name, source, code) => {
    const result = await parseVcdText(chunks(source));
    expect(result).toMatchObject({ ok: false, error: { code: code satisfies string } });
  });

  it("enforces byte, variable and change budgets", async () => {
    const valid = "$timescale 1ns $end $scope module m $end $var wire 1 ! q $end $upscope $end $enddefinitions $end #0 0! #1 1!";
    await expect(parseVcdText(chunks(valid), { maxInputBytes: 8 })).resolves.toMatchObject({ ok: false, error: { code: "resource-limit" } });
    await expect(parseVcdText(chunks(valid), { maxVariables: 1 })).resolves.toMatchObject({ ok: true });
    await expect(parseVcdText(chunks(valid.replace("$upscope $end", "$var wire 1 \" r $end $upscope $end")), { maxVariables: 1 })).resolves.toMatchObject({ ok: false, error: { code: "resource-limit" } });
    await expect(parseVcdText(chunks(valid), { maxChanges: 1 })).resolves.toMatchObject({ ok: false, error: { code: "resource-limit" } });
  });

  it("rejects width, expanded-value and hierarchy-depth resource amplification", async () => {
    const header = (scope: string, width: number, change = "#0 0!") => `$timescale 1ns $end ${scope}$var wire ${width} ! q $end ${"$upscope $end ".repeat(scope.split("$scope").length - 1)}$enddefinitions $end ${change}`;
    await expect(parseVcdText(chunks(header("$scope module m $end ", 1_000_001, "")))).resolves.toMatchObject({ ok: false, error: { code: "resource-limit" } });
    await expect(parseVcdText(chunks(header("$scope module m $end ", 4, "#0 b0 !")), { maxExpandedValueBits: 3 })).resolves.toMatchObject({ ok: false, error: { code: "resource-limit" } });
    const deepScope = `${"$scope module m $end ".repeat(129)}`;
    await expect(parseVcdText(chunks(header(deepScope, 1, "")))).resolves.toMatchObject({ ok: false, error: { code: "resource-limit" } });
  });

  it("honors an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(parseVcdText(chunks("$timescale 1ns $end"), { signal: controller.signal })).resolves.toMatchObject({ ok: false, error: { code: "aborted" } });
  });

  it("aborts while waiting for the next input chunk", async () => {
    let unblock!: () => void;
    async function* stalled(): AsyncGenerator<string> {
      await new Promise<void>((resolve) => { unblock = resolve; });
      yield "$timescale 1ns $end";
    }
    const controller = new AbortController();
    const parsing = parseVcdText(stalled(), { signal: controller.signal });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(parsing).resolves.toMatchObject({ ok: false, error: { code: "aborted" } });
    unblock();
  });
});
