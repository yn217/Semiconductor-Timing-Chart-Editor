# GUI Lock Specification

This specification is normative for the Production GUI.

## Locked structure

- The left Signal / Group panel is locked to the approved V2 v8 hierarchy;
  historical Replacement Pack hierarchy is a mapped parity input only when
  the external asset is supplied.
- The Cycle View bottom editor contains Signal, Annotation, Problems, and JSON only.
- The Transaction View bottom editor contains Transaction, Annotation, Problems, and JSON.
- Combined View may expose Signal, Transaction, Annotation, Problems, and JSON.
- The Cycle / Transaction / Combined segmented control remains on the right side of the Ribbon tab row.
- Signal Split is a Cycle-only layout option for two independent vertical viewports; it is not a view-mode choice or a signal-to-pane assignment workflow.
- The Bottom Editor belongs to the center column only.
- Production waveform traces continue to use WaveDrom/default skin. Placeholder SVGs in the reference are structural examples only.

## Role icons

The same role/type icon language is used in the left tree and canvas rows:

- Input: `[i]`
- Output: `[o]`
- Internal: `[wire]`
- Comment row: purple comment icon

Role/name columns must remain visually separate from WaveDrom trace geometry.

## Acceptance

Approved V2 v8 Reference and Production are captured at 1672x941 / DPR 1.
Major pane geometry must be within 0-2px. Screenshot existence alone is not
acceptance; a Reference-vs-DUT visual diff and DOM geometry assertions are
required. A historical Replacement Pack diff is separate and requires the
external assets plus an explicitly mapped fixture/state.
