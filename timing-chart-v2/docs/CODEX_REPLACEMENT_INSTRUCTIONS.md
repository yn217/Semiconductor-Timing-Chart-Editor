# Production GUI Replacement Instructions

Use the approved V2 v8 fixture as the current implementation source. The
historical Replacement Pack is an external parity input only when it is
actually supplied and mapped to a V2 fixture/state; do not assume an
untracked Pack exists or replace the Production DOM/CSS/icon structure from a
missing asset. Reconnect existing semantic-model command hooks while
preserving the approved V2 contract.

Preserve New/Open/Save, Undo/Redo, Signal/Group/Spacer/Transaction commands, Annotation, Problems, JSON, Snap, Cycle editing, export, selection, Inspector, persistence, and WaveDrom rendering.

Do not redesign the locked left panel or Bottom Editor tabs. Do not move Transaction into Cycle View. Do not replace WaveDrom with a custom waveform renderer. Do not modify the fixed Reference images to make Production pass.

Every GUI replacement change must include browser screenshots at 1672x941 and
a real approved-v8 Reference-vs-DUT diff for the locked panels. A historical
Replacement Pack diff may be added only when its external assets and mapped
fixture/state are available.
