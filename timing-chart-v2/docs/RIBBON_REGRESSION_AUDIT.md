# Ribbon Regression Audit — 7d44567

READ ONLY attribution for the Ribbon regression introduced by the collision-avoidance rules in `7d44567`.

| Rule | Reason introduced | Overlap benefit | Golden visual impact | Decision |
|---|---|---:|---:|---|
| `.home-timeline-group { flex-wrap: wrap; gap: 2px; overflow: hidden }` | Force Time controls into two rows | Removes sibling collisions | Changes Time geometry and increases Ribbon diff | REDESIGN |
| `.home-timeline-group > .timeline-toolbar { height: 28px; overflow: hidden }` | Compact range/action toolbar | Removes toolbar overflow | Compresses/truncates approved controls | REDESIGN |
| `.timeline-toolbar > label` compact grid | Fit Start/End/Count/To controls | Prevents label collision | Changes label and input metrics | REDESIGN |
| `.timeline-actions button { flex: 1; text-overflow: ellipsis }` | Prevent action labels from intersecting | Bounding-box overlap becomes zero | Truncates action labels versus Golden | REMOVE |
| `.timeline-objects { display: none }` | Reduce Time group height | Removes object-row collisions | Hides visible control surface | REMOVE |
| `.home-timeline-group > .ribbon-tool { height: 48px }` | Make room for wrapped toolbar | Separates icon/label slots | Changes command button height | REDESIGN |
| `.ribbon-tool > span` fixed label slot | Separate icon and label | Prevents icon/label intersection | Low direct impact; retain with Golden dimensions | KEEP |
| 1301–1500px `.ribbon { zoom: .9; width: 111.111% }` | Avoid narrow desktop overflow | Removes horizontal scroll | Changes whole Ribbon scale | REDESIGN |

Evidence: the pre-change Ribbon diff was `11.472699%`; the current DUT is `12.753307%`. The rules that hide or truncate controls are not acceptable as final recovery. No production change was made during this audit.
