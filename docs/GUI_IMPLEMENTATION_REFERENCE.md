# GUI Implementation Reference Contract

## Purpose
The generated PNG mockups are design sources, but production must not repeatedly reinterpret them. ChatGPT-authored executable HTML/CSS/SVG assets under `ui-reference-v2/` are the deterministic implementation reference.

## Priority
1. Product/behavior specifications
2. `docs/GUI_VISUAL_CONTRACT.md`
3. `ui-reference-v2/index.html` + `styles.css` + `icons.svg`
4. Original Golden PNGs under `gui-mockup/assets/original/`
5. Existing production implementation

If production differs from `ui-reference-v2` without an approved spec change, production is wrong.

## Required reference geometry @ 1672x941 / DPR 1
- title bar + app title/status
- Ribbon tab strip
- Office-style Home Ribbon with visible group boundaries/captions
- left Signal/Group pane: 268 px target
- right Inspector pane: 336 px target
- center waveform viewport above the Bottom Editor
- Bottom Editor belongs only to center column
- no dead blank region between waveform and Bottom Editor

## Icons
`ui-reference-v2/icons.svg` is an AI-readable SVG symbol sprite authored for the approved Ribbon hierarchy. Production may copy/use the sprite directly or reproduce the same paths/sizes. Do not substitute unrelated emoji or generic text symbols.

## Visual verification
Run Reference and DUT in the same Chromium build at 1672x941 / DPR 1 with deterministic content.

Reference:
`ui-reference-v2/index.html`

DUT:
production application in the corresponding Golden state.

Compare exact DOM/layout metrics; key geometry tolerance is 0-2 px. Add a real screenshot/perceptual comparison with a small reviewed threshold. The WaveDrom trace interior may be masked from GUI screenshot comparison because waveform geometry is separately verified by `docs/WAVEDROM_CONFORMANCE.md`; the waveform viewport bounds are still compared.

## Forbidden
- screenshot file-existence-only acceptance
- re-designing Ribbon grouping because commands remain reachable
- moving Bottom Editor below left/right panes
- changing pane proportions without spec update
- using a separate custom signal renderer to make screenshot comparison easier
