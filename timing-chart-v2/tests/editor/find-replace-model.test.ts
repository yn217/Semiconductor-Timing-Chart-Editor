import { describe, expect, it } from "vitest";
import { compileLiteralFindReplace } from "../../apps/editor/src/find-replace-model.js";

describe("literal Find/Replace expression compilation", () => {
  it("treats user text literally and reuses one global replacement expression safely", () => {
    const expressions = compileLiteralFindReplace("a+b[1]");
    expect(expressions).toBeDefined();
    expect(expressions!.search.test("A+B[1] signal")).toBe(true);
    expect(expressions!.search.test("aaab1 signal")).toBe(false);
    expect("a+b[1] / A+B[1]".replace(expressions!.replace, "X")).toBe("X / X");
    expect("A+B[1]".replace(expressions!.replace, "Y")).toBe("Y");
    expect(compileLiteralFindReplace("")).toBeUndefined();
  });
});
