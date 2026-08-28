# GUI Golden Task DAG

Baseline is intentionally FAIL at the locked 5% threshold. Tasks are ordered by observed region diff and dependency.

| Task | Region | Observed diff | Owner surface | Dependency |
|---|---|---:|---|---|
| GUI-MINIMAP-01 | MiniMap | 22.07% | Inspector/MiniMap layout | none |
| GUI-ROLE-01 | Role | 23.54% | frozen role column | none |
| GUI-INSPECTOR-01 | Inspector | 19.41% | Inspector panel | none |
| GUI-TITLE-01 | Title | 19.95% | titlebar tokens/content | none |
| GUI-WAVE-01 | Waveform | 14.41% | WaveDrom adapter presentation | GUI-ROLE-01 |
| GUI-STATUS-01 | Status | 14.66% | status bar | GUI-TITLE-01 |
| GUI-SIGNAL-01 | Signal | 13.35% | frozen signal column | GUI-ROLE-01 |
| GUI-LEFT-01 | Left Tree | 12.29% | signal/group tree | GUI-SIGNAL-01 |
| GUI-RIBBON-01 | Ribbon | 11.47% | shared Home Ribbon | none |
| GUI-BOTTOM-01 | Bottom | 8.22% | Bottom Context Editor | none |
| GUI-RULER-01 | Ruler | 4.64% | ruler geometry/tokens | GUI-WAVE-01 |
| GUI-TABS-01 | Tabs | 3.56% | shared tab strip | none |

Each task is intentionally a future Batch 2 microtask; this Batch does not change GUI pixels.
