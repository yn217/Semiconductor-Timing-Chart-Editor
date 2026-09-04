import { describe, expect, it } from "vitest";
import { auditSource } from "../../scripts/check-interactive-controls.mjs";

describe("interactive control audit", () => {
  it("rejects an enabled no-op button fixture", () => {
    expect(auditSource('<button type="button">Inspector More</button>', "fixture.tsx")).toEqual([
      "fixture.tsx:1 enabled/disabled <button> has no command, form-submit, or event behavior",
    ]);
  });

  it("accepts command-backed, view-only, form-submit, and stable disabled controls", () => {
    const source = '<button type="button" onClick={run}>Run</button><button type="button" onClick={toggle} aria-label="Toggle">View</button><button type="submit">Apply</button><button type="button" disabled={!canRun} title="Unavailable until a Signal is selected" onClick={run}>Run</button>';
    expect(auditSource(source)).toEqual([]);
  });
});
