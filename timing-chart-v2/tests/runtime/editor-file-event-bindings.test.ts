import { describe, expect, it, vi } from "vitest";
import { installEditorFileEventBindings, type EditorFileEventActions } from "../../apps/editor/src/application/editor-file-event-bindings.js";

class TestEventTarget extends EventTarget {}

describe("editor file event bindings", () => {
  it("keeps drop and save/open behavior current, filters irrelevant input, and removes listeners", () => {
    const target = new TestEventTarget();
    const dropped: File[] = [];
    const shortcuts: string[] = [];
    let actions: EditorFileEventActions = { onDropFile: (file) => dropped.push(file), onFileShortcut: (key) => shortcuts.push(key) };
    const dispose = installEditorFileEventBindings(target, () => actions);

    const preventDefault = vi.fn();
    const file = {} as File;
    const dropEvent = Object.assign(new Event("drop"), { dataTransfer: { types: ["Files"], files: [file], dropEffect: "none" }, preventDefault }) as unknown as DragEvent;
    const dragOver = Object.assign(new Event("dragover"), { dataTransfer: { types: ["Files"], dropEffect: "none" }, preventDefault: vi.fn() }) as unknown as DragEvent;
    target.dispatchEvent(dragOver);
    target.dispatchEvent(dropEvent);
    expect(dragOver.dataTransfer?.dropEffect).toBe("copy");
    expect(dragOver.preventDefault).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(dropped).toEqual([file]);

    actions = { onDropFile: () => undefined, onFileShortcut: (key) => shortcuts.push(`fresh:${key}`) };
    const sendKey = (overrides: Partial<KeyboardEvent>) => target.dispatchEvent(Object.assign(new Event("keydown"), { ctrlKey: false, metaKey: false, altKey: false, isComposing: false, key: "", shiftKey: false, preventDefault: vi.fn(), ...overrides }));
    sendKey({ ctrlKey: true, key: "s" });
    sendKey({ metaKey: true, key: "o" });
    sendKey({ ctrlKey: true, shiftKey: true, key: "S" });
    sendKey({ ctrlKey: true, shiftKey: true, key: "o" });
    sendKey({ ctrlKey: true, isComposing: true, key: "s" });
    expect(shortcuts).toEqual(["fresh:s", "fresh:o", "fresh:S"]);

    dispose();
    target.dispatchEvent(Object.assign(new Event("keydown"), { ctrlKey: true, key: "s", preventDefault: vi.fn() }));
    expect(shortcuts).toHaveLength(3);
  });
});
