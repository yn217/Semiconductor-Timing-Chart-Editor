import { afterEach, expect, test, vi } from "vitest";
import { attachDirtyUnloadGuard } from "../../apps/editor/src/runtime/editor-dom-bridge.js";

afterEach(() => vi.unstubAllGlobals());

test("clean documents do not register an unload handler", () => {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  vi.stubGlobal("window", { addEventListener, removeEventListener });
  attachDirtyUnloadGuard(false)();
  expect(addEventListener).not.toHaveBeenCalled();
  expect(removeEventListener).not.toHaveBeenCalled();
});

test("dirty guard requests native confirmation and cleanup removes the exact handler", () => {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  vi.stubGlobal("window", { addEventListener, removeEventListener });
  const cleanup = attachDirtyUnloadGuard(true);
  expect(addEventListener).toHaveBeenCalledOnce();
  const [type, handler] = addEventListener.mock.calls[0]!;
  expect(type).toBe("beforeunload");
  const event = { preventDefault: vi.fn(), returnValue: "ignored custom text" };
  handler(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(event.returnValue).toBe("");
  cleanup();
  expect(removeEventListener).toHaveBeenCalledExactlyOnceWith("beforeunload", handler);
  attachDirtyUnloadGuard(false)();
  expect(addEventListener).toHaveBeenCalledOnce();
});
