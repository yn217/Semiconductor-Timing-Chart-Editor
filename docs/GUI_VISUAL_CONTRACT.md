# GUI Visual Acceptance Contract

This document is normative. The original GUI mockup images are Golden Visual References, not loose inspiration.

## 1. Reference viewport
Golden images were designed at approximately `1672 x 941` px.

At this reference viewport, preserve the same information hierarchy and approximate layout proportions. Responsive behavior may adapt at other sizes, but must not collapse the desktop UI into a generic one-row toolbar.

## 2. Required desktop composition

```text
┌───────────────────────────────────────────────────────────────┐
│ Window title / menu tabs                                      │
├───────────────────────────────────────────────────────────────┤
│ Multi-group Ribbon                                            │
├──────────────┬─────────────────────────────┬──────────────────┤
│ Signal Tree  │ Waveform Canvas             │ Inspector        │
│              │                             │                  │
│              ├─────────────────────────────┤                  │
│              │ Bottom Context Editor       │                  │
│              │ Signal/Annotation/.../JSON  │                  │
└──────────────┴─────────────────────────────┴──────────────────┘
```

The Bottom Context Editor belongs to the **center column**. Left Signal Tree and Right Inspector remain vertically continuous beside it.

## 3. Approximate Golden metrics at 1672 x 941
These are layout acceptance targets, not arbitrary suggestions.

- Left Signal/Group panel: about `280 px`
- Right Inspector: about `350-370 px`
- Center: remaining width, roughly `1020-1040 px`
- Top menu + Ribbon: about `185-195 px`
- Center waveform region: about `390-405 px` high before Bottom Editor
- Bottom Context Editor: roughly `330-350 px` high by default

Structural metric tolerance at the reference viewport: normally ±8 px unless browser/font platform differences require an explicitly documented exception.

## 4. Ribbon contract
The Golden UI uses an Office-like Ribbon with command groups and separators.

Required characteristics:
- multi-row/tall command area, not a generic one-line button strip
- visible command grouping
- group captions/separators where applicable
- waveform/document commands grouped by task
- zoom/view controls visually grouped

A UI such as:

```text
New Open Save +Signal +Group Annotation Arrow Insert Delete Undo Redo View...
```

all on one horizontal strip is **not compliant** with the Golden UI.

## 5. Center waveform contract
The waveform is the primary work surface.

- Use the available center width.
- Do not leave a large unused blank region directly below a small waveform while the Bottom Editor occupies the whole application width.
- Signal label/role area must be visually separated from waveform traces.
- `[i]`, `[o]`, `[wire]` are role badges/columns, not text embedded into the signal trace area.
- Group background bands may extend through label+waveform or waveform-only according to group settings.
- Clock Edge Counter numbers are custom overlay labels anchored to WaveDrom edge Geometry; they must not replace or distort WaveDrom clock paths.
- Multiple clock signals may show independent edge indices simultaneously without label ownership ambiguity.

## 6. Bottom Editor contract
Tabs:
- Signal
- Annotation
- Problems
- JSON
- Transaction when implemented

The editor is a substantial work area, not a tiny status pane.
Signal Event Table should be spreadsheet-like and horizontally aligned with the center waveform area.

## 7. Inspector contract
Right Inspector stays visible beside both the waveform and Bottom Editor.
Properties are sectioned/grouped rather than presented as an unstructured long form.

For a selected Clock signal, expose a grouped `Edge Numbers` section containing Show, Rising/Falling/Both mode, Start number, Count from, Show every N edges, Above/Below and X/Y offset controls.

## 8. Signal tab Golden state
Must visibly include:
- selected signal in left tree
- waveform in upper center
- Signal bottom tab active
- Start/Value event table
- quick value operations where applicable
- right Inspector for selected signal

For Clock selection, a representative Golden/visual-regression state should also verify Edge Numbers without changing the underlying WaveDrom clock geometry.

## 9. Annotation tab Golden state
Must visibly include:
- waveform remains visible
- Annotation bottom tab active
- semantic start/end anchors
- anchor type
- label text
- X/Y pixel offset controls
- snap controls
- Apply/Cancel/Delete workflow as appropriate

## 10. JSON tab Golden state
Must visibly include:
- waveform remains visible
- JSON bottom tab active
- read-only by default
- Format / Validate / Copy
- Selected Object / Whole Document scope
- JSON is an advanced view, not the primary authoring surface

## 11. Visual testing
For the reference viewport, automated tests shall include:

1. DOM/layout metric assertions
2. Playwright screenshots for Signal / Annotation / JSON states
3. visual diff against Golden references
4. explicit review of any accepted baseline update
5. representative Clock Edge Counter screenshots for Rising/Falling/Both and multiple clocks

No code change may silently regenerate Golden screenshots and declare success.

## 12. Separation from WaveDrom geometry
Full-window screenshot comparison is not sufficient for waveform correctness.
Waveform geometry is validated separately by `docs/WAVEDROM_COMPATIBILITY.md` using SVG/path-level tests with 0 px default tolerance.
Clock Edge Counter is an overlay consumer of the Geometry Map and must therefore be excluded from the raw WaveDrom trace geometry comparison while still being tested for exact anchor alignment.

## 13. Current known non-compliant patterns
The following patterns are explicitly rejected:
- one-line generic toolbar replacing the Ribbon
- Bottom Editor spanning the full app width beneath Left/Right sidebars
- waveform confined to a small top-left area with a large unused blank canvas
- signal role/name text drawn inside waveform lanes
- custom binary/bus transition shapes that differ from WaveDrom
- clock edge numbers positioned from an independent cycle-to-pixel formula rather than actual rendered edge Geometry

These patterns must not be treated as acceptable simply because all functional controls are present.
