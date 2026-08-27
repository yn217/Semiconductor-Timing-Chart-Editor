# GUI Implementation Reference Contract

## Purpose
The generated PNG mockups are design sources, but production must not repeatedly reinterpret them. The checked-in `references/gui-replacement-pack/` images and the Replacement Pack's HTML/CSS/SVG assets are the deterministic implementation reference.

## Priority
1. Product/behavior specifications
2. Approved v8 overrides: `references/v2-gui-reference-v8/gui-reference.json`
3. `docs/GUI_VISUAL_CONTRACT.md`
4. v8 `index.html` + `styles.css` + `golden-home-cycle-1672x941.png`
5. Replacement Pack `production/index.html` + `styles.css` + `icons.svg` + `app-ui.js`
6. Existing production implementation

If production differs from the Replacement Pack without an approved spec change, production is wrong.

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
`gui-mockup/icons.svg` is the Production SVG symbol sprite copied from the Replacement Pack. Production must render these symbols through `<svg><use href="icons.svg#...">`; do not substitute unrelated emoji or generic text symbols.

## Visual verification
Run Reference and DUT in the same Chromium build at 1672x941 / DPR 1 with deterministic content.

Reference:
fixed Replacement Pack images and DOM/CSS structure

DUT:
production application in the corresponding Golden state.

Compare exact DOM/layout metrics; key geometry tolerance is 0-2 px. Add a real screenshot/perceptual comparison with a small reviewed threshold. The WaveDrom trace interior may be masked from GUI screenshot comparison because waveform geometry is separately verified by `docs/WAVEDROM_CONFORMANCE.md`; the waveform viewport bounds are still compared.

## Forbidden
- screenshot file-existence-only acceptance
- re-designing Ribbon grouping because commands remain reachable
- moving Bottom Editor below left/right panes
- changing pane proportions without spec update
- using a separate custom signal renderer to make screenshot comparison easier
