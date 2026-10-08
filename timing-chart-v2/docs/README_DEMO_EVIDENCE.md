# README demo evidence

Review date: 2026-10-09. Tracking issue: #1098. Initial media PR: #1101 (merged).

## Generated assets

All eight assets are production-preview UI captures at 1440 × 900, DPR 1.
The encoder uses 12 fps with palettegen/paletteuse. GIF delays are quantized
to hundredths of a second; an inspector may report 12.5 fps instead.

| Asset | Duration (s) | Bytes |
| --- | ---: | ---: |
| hero-timing-chart.gif | 18.50 | 8,634,120 |
| quick-start.gif | 12.50 | 6,201,937 |
| transaction-view.gif | 11.66 | 5,408,486 |
| measurement.gif | 11.00 | 6,341,470 |
| timeline-edit.gif | 8.83 | 4,050,633 |
| annotation.gif | 7.41 | 5,082,879 |
| scenario-compare.gif | 11.91 | 4,730,881 |
| export.gif | 9.25 | 4,295,617 |

Each feature is below the 7 MB review threshold. Hero is below 12 MB.
The ideal 4 MB / 8 MB targets are exceeded; native text resolution and
palette quality have been retained rather than reducing readability.

## Reproduction

Run from `timing-chart-v2` with dependencies and ffmpeg installed:

```powershell
node scripts/capture-readme-demos.mjs --grep 'hero-timing-chart$|quick-start$|transaction-view$|measurement$|timeline-edit$|annotation$|scenario-compare$|export$'
node scripts/encode-readme-demos.mjs hero-timing-chart quick-start transaction-view measurement timeline-edit annotation scenario-compare export
node scripts/review-readme.mjs
```

Preserve existing GIFs before encoding: the encoder refuses overwrites.
Capture rebuilds the production app, starts a run-owned preview server,
and uses isolated browser contexts. It does not connect to the human's
development browser or directly mutate Canonical state.
See [regeneration instructions](README_DEMOS.md).

## Focused journey results

Each of the eight journeys completed successfully in an individual focused
run, with zero captured console errors and page errors. Journey assertions
cover real waveform creation, stable-ID measurement selection, timeline
insert propagation, Scenario comparison/reveal, Transaction creation in
the Hero, and an actual SVG download in Export.

The Quick Start journey checks saved Signal transitions. Measurement checks
100 MHz, source endpoints 3 and 5, and the displayed 2 cycles / 20 ns.
Timeline checks one History operation, shifted transitions, and the same
Annotation ID moving from cycle 5 to 7. Scenario reveal checks that the
view-only operation does not change Canonical revision, History, or Dirty.

The clockless authoring defect discovered during capture was fixed in
`7c75b42` and tracked as #1102. It was not concealed by editing a recording.

## Rendering and visual review

At `41212de`, the GitHub Markdown API rendered the root README. The local
responsive review at widths 1440 and 390 decoded all eight GIF images and
found no horizontal document overflow. This verifies GitHub-generated
markup with local review CSS, not pixel-identical GitHub website styling.
The repository is private; anonymous GitHub page access is not a valid
asset-resolution check.

Contact sheets sampling every 0.5 seconds across all eight GIFs were
reviewed. They show the intended authoring dialogs and mode transitions,
with no observed error toast, developer/browser chrome, secret, personal
name, or local file path in the sampled frames. The empty document in
Quick Start is intentional after deleting the template Signals.

This sampling is not an exhaustive every-frame privacy certification.
Full-size text review and final manual-to-current-UI coverage remain
separate closure requirements. #1098 must not be closed on this evidence
document alone.
