import { afterEach, describe, expect, it, vi } from "vitest";
import { ScenarioCommandHistorySession } from "../../packages/history/src/scenario-session.js";
import type { BookmarkId, CanonicalDocument, ScenarioId } from "@timing-chart-v2/schema";
import { duplicateScenario, scenarioModelFromV2, validateScenarioDocumentModel } from "../../packages/schema/src/scenario-model.js";
import { canonicalFixture } from "../fixtures/canonical.js";

afterEach(() => { vi.resetModules(); });

describe("generated entity IDs across Scenarios", () => {
  it("allocates a bookmark ID that another Scenario already owns only when it is not reserved", async () => {
    // A fresh page restarts the allocator sequence, so the first generated bookmark ID is bookmark_phase9_1 again.
    vi.resetModules();
    const entityId = await import("../../apps/editor/src/entity-id.js");
    const base = canonicalFixture();
    const seeded: CanonicalDocument = { ...base, bookmarks: [{ id: "bookmark_phase9_1" as BookmarkId, name: "Saved", start: 1 }] };
    const first = scenarioModelFromV2(seeded);
    // Scenario A owns bookmark_phase9_1; Scenario B is a copy that owns only its own remapped IDs.
    const model = duplicateScenario(first, first.scenarios[0]!.id);
    const scenarioA = model.scenarios[0]!.id;
    const scenarioB = model.scenarios[1]!.id;
    expect(validateScenarioDocumentModel(model)).toEqual([]);
    const session = new ScenarioCommandHistorySession(model, scenarioB);

    // Without a reservation source the allocator hands B the ID that A owns: the command is rejected.
    const unreserved = entityId.createEntityIdAllocator(session.getSnapshot().document as CanonicalDocument)("bookmark");
    expect(unreserved).toBe("bookmark_phase9_1");
    expect(session.execute({ id: "cmd_unreserved" as never, type: "bookmark.create", bookmark: { id: unreserved as BookmarkId, name: "B", start: 2 } }).ok).toBe(false);

    // With the session wired as the reservation source, the allocator skips IDs owned by A.
    entityId.setReservedEntityIdSource(() => session.allScenarioEntityIds());
    try {
      const reserved = entityId.createEntityIdAllocator(session.getSnapshot().document as CanonicalDocument)("bookmark");
      expect(reserved).not.toBe("bookmark_phase9_1");
      expect(session.allScenarioEntityIds().has("bookmark_phase9_1")).toBe(true);
      const result = session.execute({ id: "cmd_reserved" as never, type: "bookmark.create", bookmark: { id: reserved as BookmarkId, name: "B", start: 2 } });
      expect(result.ok).toBe(true);
      expect(validateScenarioDocumentModel(session.scenarioModel())).toEqual([]);
      expect(session.scenarioModel().scenarios.find((scenario) => scenario.id === scenarioA)!.bookmarks.map((item) => item.id)).toEqual(["bookmark_phase9_1"]);
    } finally {
      entityId.setReservedEntityIdSource(undefined);
    }
  });

  it("keeps the allocator unchanged for a document without a reservation source", async () => {
    vi.resetModules();
    const entityId = await import("../../apps/editor/src/entity-id.js");
    const id = entityId.nextEntityId("bookmark", canonicalFixture());
    expect(id).toBe("bookmark_phase9_1");
    expect(entityId.nextEntityId("bookmark", canonicalFixture())).toBe("bookmark_phase9_2");
  });
});
