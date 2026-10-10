import { describe, expect, it } from "vitest";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import { nextSignalGroupName } from "../../apps/editor/src/application/selection-group-actions.js";

function documentWithGroups(...names: string[]): Pick<CanonicalDocument, "signalGroups"> {
  return { signalGroups: names.map((name, index) => ({ id: `grp_${index}`, name, rows: [] })) } as unknown as Pick<CanonicalDocument, "signalGroups">;
}

describe("nextSignalGroupName", () => {
  it("numbers a new Group after the existing ones", () => {
    expect(nextSignalGroupName(documentWithGroups("Group 1", "Group 2"))).toBe("Group 3");
  });

  it("reuses the lowest free number after a Group is deleted", () => {
    expect(nextSignalGroupName(documentWithGroups("Group 1", "Group 3"))).toBe("Group 2");
  });

  it("starts at Group 1 when there are no Groups", () => {
    expect(nextSignalGroupName(documentWithGroups())).toBe("Group 1");
  });

  it("ignores custom names when picking the number", () => {
    expect(nextSignalGroupName(documentWithGroups("Pipeline", "Group 1"))).toBe("Group 2");
  });
});
