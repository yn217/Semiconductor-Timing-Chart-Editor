import { describe, expect, it } from "vitest";
import { documentFilename } from "../../apps/editor/src/document-filename.js";

describe("documentFilename", () => {
  it("keeps ordinary titles, adds one .tcd and replaces characters no file system accepts", () => {
    expect(documentFilename("Plain")).toBe("Plain.tcd");
    expect(documentFilename("日本語 title")).toBe("日本語 title.tcd");
    expect(documentFilename("a/b\\c:d*e?f\"g<h>i|j")).toBe("a_b_c_d_e_f_g_h_i_j.tcd");
    expect(documentFilename("name.tcd")).toBe("name.tcd");
    expect(documentFilename("NAME.TCD")).toBe("NAME.tcd");
  });
  it("suffixes Windows device names so the saved file never targets a device", () => {
    expect(documentFilename("CON")).toBe("CON_.tcd");
    expect(documentFilename("con.tcd")).toBe("con_.tcd");
    expect(documentFilename("  AUX  ")).toBe("AUX_.tcd");
    expect(documentFilename("nul.txt")).toBe("nul_.txt.tcd");
    expect(documentFilename("COM1")).toBe("COM1_.tcd");
    expect(documentFilename("lpt9.log")).toBe("lpt9_.log.tcd");
    expect(documentFilename("COM¹")).toBe("COM¹_.tcd");
    expect(documentFilename("CON.".padEnd(200, "x"))).toMatch(/^CON_\.x+\.tcd$/);
    expect(documentFilename("CON.".padEnd(200, "x")).length).toBe(124);
  });
  it("leaves names that only start with a device name alone", () => {
    expect(documentFilename("CONSOLE")).toBe("CONSOLE.tcd");
    expect(documentFilename("CONNECT.tcd")).toBe("CONNECT.tcd");
    expect(documentFilename("COM10")).toBe("COM10.tcd");
    expect(documentFilename("COM0")).toBe("COM0.tcd");
    expect(documentFilename("my CON")).toBe("my CON.tcd");
  });
  it("never returns an empty or dot-only base and bounds the length", () => {
    for (const title of ["", "  ", "..", ".", undefined]) expect(documentFilename(title)).toBe("timing-chart.tcd");
    expect(documentFilename("x".repeat(500)).length).toBe(124);
    expect(documentFilename("trailing dot. ")).toBe("trailing dot.tcd");
  });
});
