import { describe, expect, it } from "vitest";
import { importVcdTextFile } from "../../apps/editor/src/simulation/vcd-file-import.js";

describe("importVcdTextFile", () => {
  it("streams a VCD Blob through the bounded parser", async () => {
    const file = new Blob([
      "$timescale 1ns $end $scope module top $end $var wire 1 ! clk $end $upscope $end $enddefinitions $end #0 0! #1 1!",
    ]);
    await expect(importVcdTextFile(file)).resolves.toMatchObject({
      ok: true,
      value: {
        variables: [{ hierarchicalName: "top.clk" }],
        changes: [{ timestamp: 0n, value: "0" }, { timestamp: 1n, value: "1" }],
      },
    });
  });

  it("rejects an oversized file before reading it", async () => {
    const file = new Blob(["not read"]);
    await expect(importVcdTextFile(file, { maxInputBytes: 2 })).resolves.toMatchObject({
      ok: false,
      error: { code: "resource-limit" },
    });
  });

  it("aborts file parsing and releases the stream reader", async () => {
    const controller = new AbortController();
    const file = new Blob(["$timescale 1ns $end", "$scope module top $end $var wire 1 ! clk $end $upscope $end $enddefinitions $end"]);
    controller.abort();
    await expect(importVcdTextFile(file, { signal: controller.signal })).resolves.toMatchObject({
      ok: false,
      error: { code: "aborted" },
    });
  });
});
