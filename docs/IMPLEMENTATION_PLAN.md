# Implementation Plan

Recommended order:
1. Repository / application bootstrap
2. Semantic document model and `.tcd` persistence
3. WaveDrom renderer adapter + geometry golden tests
4. Signal groups, roles, labels, legend, Group Band, vertical spacing
5. Signal editing GUI / Event Table / clock editor / per-clock Edge Counter overlay
6. Timeline editing / cycle insertion & deletion
7. Annotation overlay / geometry anchor / snap / pixel offset
8. Transition arrows / dependency edges
9. Bottom tabs / Problems / JSON advanced view
10. Header/footer and document layout
11. Export
12. Transaction View foundation
13. E2E and visual regression closure
14. GUI Golden reference assets maintenance
15. 20 Golden Samples / feature coverage matrix / acceptance harness

P0 visual correction gate:
- GUI layout must satisfy `docs/GUI_VISUAL_CONTRACT.md`.
- Cycle waveform trace geometry must satisfy `docs/WAVEDROM_COMPATIBILITY.md` and `docs/WAVEDROM_CONFORMANCE.md`.
- Clock Edge Counter labels are custom overlays anchored to WaveDrom Geometry Map edges; they must not alter WaveDrom signal geometry.
