# Production GUI Replacement Instructions

Use the Replacement Pack as the implementation source. Replace the Production DOM/CSS/icon structure with the Pack structure and reconnect the existing semantic-model command hooks.

Preserve New/Open/Save, Undo/Redo, Signal/Group/Spacer/Transaction commands, Annotation, Problems, JSON, Snap, Cycle editing, export, selection, Inspector, persistence, and WaveDrom rendering.

Do not redesign the locked left panel or Bottom Editor tabs. Do not move Transaction into Cycle View. Do not replace WaveDrom with a custom waveform renderer. Do not modify the fixed Reference images to make Production pass.

Every GUI replacement change must include browser screenshots at 1672x941 and a real Reference-vs-DUT diff for the locked panels.
