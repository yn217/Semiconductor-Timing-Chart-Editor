import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "../..");
const source = (file: string) => readFileSync(resolve(workspace, file), "utf8");

describe("review leftover guards", () => {
  it("Bookmark Expand and Jump expands through one batch and reveals only on success", () => {
    const text = source("apps/editor/src/bookmark-editor.tsx");
    const body = /const expandAndJump = \(\) => \{([^\n]*)\};/.exec(text)?.[1] ?? "";
    expect(body).toContain("commands.expandAllTimeGroups(containingGroups).ok");
    expect(body).not.toMatch(/for \(|updateTimeGroupPresentation/);
    expect(body).toMatch(/if \(commands\.expandAllTimeGroups\(containingGroups\)\.ok\) onReveal\(/);
  });

  it("Rename dialog keeps itself open and reports the rejection when selection.rename fails", () => {
    const text = source("apps/editor/src/application/use-editor-actions.ts");
    const body = /const applyRename = \(\) => \{([\s\S]*?)\n  \};/.exec(text)?.[1] ?? "";
    const rejection = body.indexOf("!result.ok");
    expect(rejection).toBeGreaterThan(-1);
    expect(body.slice(rejection)).toMatch(/setRenameError\([^)]*problems[\s\S]*return;[\s\S]*setRenameDialogOpen\(false\)/);
  });

  it("insertion paths without a target Signal Group report a status instead of returning silently", () => {
    const clipboard = source("apps/editor/src/application/clipboard-actions.ts");
    const clipboardCreate = source("apps/editor/src/application/clipboard-create-actions.ts");
    expect(clipboard).not.toMatch(/if \(!target(?: \|\| input\.length === 0)?\) return;/);
    expect(clipboard).not.toMatch(/if \(created\.length === 0\) return;/);
    expect(clipboard.match(/setStatus\(NO_SIGNAL_GROUP_STATUS\)/g)?.length).toBe(2);
    expect(clipboardCreate.match(/reportStatus\("No Signal Group to insert into"\)/g)?.length).toBe(1);
    const actions = source("apps/editor/src/application/use-editor-actions.ts");
    expect(actions).not.toMatch(/if \(!target\) return;/);
    expect(actions).toContain("reportStatus(NO_SIGNAL_GROUP_STATUS)");
  });

  it("AI batch apply records an AI-specific operation id", () => {
    const text = source("apps/editor/src/editor-secondary-surfaces.tsx");
    const batch = /onCommandBatch: \(commands\) =>([\s\S]*?)\n    getZoom/.exec(text)?.[1] ?? "";
    expect(batch).toContain('nextCommandId("ai_batch_apply")');
    expect(batch).not.toContain("ribbon_annotation_arrange");
  });
});
