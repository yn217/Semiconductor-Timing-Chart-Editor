import { describe, expect, it } from "vitest";
import type { SemanticAnchor, Signal } from "@timing-chart-v2/schema";
import { supportsTransitionMeasurement } from "../../apps/editor/src/measurement-profile-capability.js";

const anchor = (signalId: string): SemanticAnchor => ({ signalId: signalId as SemanticAnchor["signalId"], cycle: 2, point: "cycle-start" });
const signal = (id: string, type: Signal["type"]): Signal => ({ id: id as Signal["id"], type } as Signal);

describe("transition Measurement profile capability", () => {
  it("allows two resolvable value-bearing timing signals", () => {
    expect(supportsTransitionMeasurement(anchor("data"), anchor("data"), [signal("data", "binary")])).toBe(true);
  });

  it("rejects clock anchors because transition points are undefined for clocks", () => {
    expect(supportsTransitionMeasurement(anchor("clock"), anchor("data"), [signal("clock", "clock"), signal("data", "binary")])).toBe(false);
  });

  it("rejects non-timing, missing, or unresolved endpoint signals", () => {
    expect(supportsTransitionMeasurement(anchor("note"), anchor("data"), [signal("note", "commentRow"), signal("data", "binary")])).toBe(false);
    expect(supportsTransitionMeasurement(undefined, anchor("data"), [signal("data", "binary")])).toBe(false);
    expect(supportsTransitionMeasurement(anchor("missing"), anchor("data"), [signal("data", "binary")])).toBe(false);
  });
});
