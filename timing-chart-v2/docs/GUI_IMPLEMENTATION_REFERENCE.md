# GUI Implementation Reference Contract

## Purpose
The generated PNG mockups are design sources, but production must not repeatedly reinterpret them. The approved V2 v8 fixture under `references/v2-gui-reference-v8/` is the current executable implementation reference. The historical V1 Replacement Pack is an external input when supplied and mapped; it is not a tracked directory in the current V2 tree.

## Priority
1. Product/behavior specifications
2. Approved v8 overrides: `references/v2-gui-reference-v8/gui-reference.json`
3. `docs/GUI_VISUAL_CONTRACT.md`
4. v8 `index.html` + `styles.css` + `golden-home-cycle-1672x941.png`
5. Existing production implementation
6. External historical Replacement Pack, only after a mapped V2 fixture/state and unchanged-reference comparison are supplied

If production differs from the approved V2 v8 contract without an approved spec change, production is wrong. A missing external Replacement Pack must not be silently treated as a passing or failing V2 comparison.

## Required reference geometry @ 1672x941 / DPR 1
- title bar + app title/status
- Ribbon tab strip
- Office-style Home Ribbon with visible group boundaries/captions
- left Signal/Group pane: 265 px target in v8 reference mode
- right Inspector pane: 297 px target in v8 reference mode
- Ribbon: 146 px target after title/menu rows
- Bottom Editor: 270 px target in Cycle View
- center waveform viewport above the Bottom Editor
- Bottom Editor belongs only to center column
- no dead blank region between waveform and Bottom Editor

## Icons
When a legacy Replacement Pack is supplied, its `gui-mockup/icons.svg` is historical input for the mapped comparison. Current V2 production must use its tracked semantic SVG/icon implementation and must not substitute unrelated emoji or generic text symbols merely because the external pack is unavailable.

## Visual verification
Run Reference and DUT in the same Chromium build at 1672x941 / DPR 1 with deterministic content.

Reference:
the approved V2 v8 fixture and its DOM/CSS structure. A historical Replacement
Pack comparison is a separate audit and requires the external assets plus an
explicitly mapped V2 fixture/state.

DUT:
production application in the corresponding Golden state.

Compare exact DOM/layout metrics; key geometry tolerance is 0-2 px. Add a real screenshot/perceptual comparison with a small reviewed threshold. The WaveDrom trace interior may be masked from GUI screenshot comparison because waveform geometry is separately verified by `docs/WAVEDROM_CONFORMANCE.md`; the waveform viewport bounds are still compared.

## Forbidden
- screenshot file-existence-only acceptance
- re-designing Ribbon grouping because commands remain reachable
- moving Bottom Editor below left/right panes
- changing pane proportions without spec update
- using a separate custom signal renderer to make screenshot comparison easier
