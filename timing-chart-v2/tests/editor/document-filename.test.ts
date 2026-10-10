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
  it("never returns an empty or dot-only base and bounds the length", () => {
    for (const title of ["", "  ", "..", ".", undefined]) expect(documentFilename(title)).toBe("timing-chart.tcd");
    expect(documentFilename("x".repeat(500)).length).toBe(124);
    expect(documentFilename("trailing dot. ")).toBe("trailing dot.tcd");
  });
});
