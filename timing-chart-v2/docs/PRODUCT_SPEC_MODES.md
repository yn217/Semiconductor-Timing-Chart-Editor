# Current product specification delta: view modes, time truth, Signal Split, AI (#570)

Status of this document: derived from the implementation on `agent/claude` (verified in the browser and by tests),
not a new decision. Where the code and #570 disagree, the disagreement is listed under "Open deltas".

## 1. Terminology (as implemented)

| Term | Meaning | UI / code |
|---|---|---|
| Cycle View | waveform / signal timing view | ribbon button "Cycle"; `viewMode "Cycle"` |
| Transaction View | Group / Lane / Transaction / Phase view | button "Transaction"; `viewMode "Transaction"` |
| Combined View | Transaction over Cycle on one shared time axis | button "Combined"; internal enum `"Split"` |
| Signal Split | the Cycle view as two viewports of the same Signal list | View ribbon option; `signalSplitEnabled` (workspace state, not persisted in the document) |

The mode switcher reads `Cycle | Transaction | Combined`; the internal enum value `Split` is not shown in the UI
(status bar reads `Mode: Combined`). The shell publishes `data-view-mode` (`Cycle|Transaction|Split`) and every
mode has one owner stylesheet (`mode-cycle.css`, `mode-transaction.css`, `mode-combined.css`).

## 2. One time truth

Canonical time is system cycles. All three views derive X from the shared `DisplayTimeMapping` / TimeAxis
geometry; verified by `combined-column-resize-alignment`, `issue-593-mode-layout-isolation`,
`gui-split-view-visual` (Transaction track width == Cycle signal content width). Transaction cycles per TC is a
presentation ratio (`transactionTimeScale`), selectable from the Transaction header (#750); canonical Start/End
stay in system cycles.

## 3. Mode behaviour worth knowing

- Transaction mode defers painting non-reference waveforms; leaving it repaints unpainted owners once (#624).
- View-only operations (mode switch, selection, panel toggles, zoom, sorting) change no Canonical/History/Dirty.
- Bottom "Follow Selection" / "Pin" live behind the ⚙ popover; the current target is always shown
  ("Following Selection" / "Pinned: <tab>") (#747).
- Combined routes the Inspector by the active pane; the Transaction Tree (left rail) makes Transaction active.

## 4. AI (#569)

External, subscription/account-authenticated agents reach the Editor through the local Agent Bridge only
(`scripts/ai-bridge-server.mjs` binds 127.0.0.1; the client refuses non-loopback hosts). The Editor holds no
provider API key and calls no usage-billed provider API. Enforced by `tests/security/ai-provider-policy.test.ts`
and `tests/security/ai-bridge-security.test.ts`.

## 5. Resolved / open deltas

- Resolved (owner decision): the legacy per-signal `display.splitPane` (`upper|lower|both`) is removed. Old
  documents that still carry it open normally (the value is ignored) and Save never writes it back; the schema
  property, `SignalDisplay` field and the `signal.updateProperties` option no longer exist
  (`tests/schema/legacy-split-pane.test.ts`).
- Older issues that still describe Signal Split as Upper/Lower/Both assignment should be annotated as superseded.
