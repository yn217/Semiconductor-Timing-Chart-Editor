import { describe, expect, it } from "vitest";
import { auditPreviewControls, auditSource } from "../../scripts/check-interactive-controls.mjs";

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

  // #332 item C: a status-text-only placeholder can evade the check above
  // (it has a real onClick), so this is a second, targeted pass for controls
  // that specifically advertise a "Preview" capability.
  it("rejects a Preview button whose handler only flips local status state", () => {
    const source = '<button type="button" onClick={() => setStatus("updated")} data-testid="thing-preview">Preview</button>';
    expect(auditPreviewControls(source, "fixture.tsx")).toEqual([
      "fixture.tsx:1 Preview-labeled <button> has no delegated effect (onXxx(...)) anywhere in its source -- looks like a status-text-only placeholder",
    ]);
  });

  it("accepts a Preview button whose effect is delegated directly from the click handler", () => {
    const source = '<button type="button" onClick={() => onPreview({ label })}>Preview Update</button>';
    expect(auditPreviewControls(source, "fixture.tsx")).toEqual([]);
  });

  it("accepts a Preview toggle whose effect is delegated from a reactive useEffect instead of the click handler itself", () => {
    const source = 'const [preview, setPreview] = useState(false);\nuseEffect(() => { onPreview(preview ? draft : undefined); }, [preview, draft, onPreview]);\n<button type="button" onClick={() => setPreview((current) => !current)} aria-label="Preview">Preview</button>';
    expect(auditPreviewControls(source, "fixture.tsx")).toEqual([]);
  });
});
