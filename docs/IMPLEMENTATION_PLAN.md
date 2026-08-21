# Implementation Plan

Recommended order:

1. Repository / application bootstrap
2. Semantic document model and `.tcd` persistence
3. **WaveDrom direct renderer adapter + SVG geometry Golden tests**
4. **GUI Visual Contract baseline and layout regression tests**
5. Signal groups, roles, labels, legend, Group Band, vertical spacing
6. Signal editing GUI / Event Table / clock editor
7. Timeline editing / cycle insertion & deletion
8. Annotation overlay / geometry anchor / snap / pixel offset
9. Transition arrows / dependency edges
10. Bottom tabs / Problems / JSON advanced view
11. Header/footer and document layout
12. Export
13. Transaction View foundation
14. E2E and visual regression closure
15. GUI reference assets maintenance
16. 20 Golden Samples / feature coverage matrix / acceptance harness

## Gate A — WaveDrom fidelity
Before downstream Cycle GUI is considered visually valid:
- use WaveDrom/default-skin waveform trace layer
- 0/1/X/Z/bus/clock/phase/gap Geometry Golden tests pass
- default geometry tolerance is 0px
- signal role/name is outside waveform trace area

Do not proceed by accepting a custom digital waveform renderer that is only semantically equivalent.

## Gate B — GUI visual baseline
Before visual closure:
- `docs/GUI_VISUAL_CONTRACT.md` is implemented
- desktop Ribbon is not replaced by a one-row generic toolbar
- Left / Center / Right composition matches Golden layout
- Bottom Context Editor stays in the center column
- Signal / Annotation / JSON Golden screenshot tests exist

## Gate C — Golden samples
All 20 samples must load/render; feature coverage matrix gaps require an explicit skip reason.
