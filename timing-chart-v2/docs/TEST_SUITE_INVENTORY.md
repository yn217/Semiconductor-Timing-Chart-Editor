# Playwright test inventory

Generated from Playwright collection (1.62.1); 432 spec files and 1312 test cases. Collection does not execute tests.
Baseline 965ceccfe8fdc09a431f0d1f7aa08b02b41c0b3a: 337 spec files / 988 cases. Full-profile wall time and aggregate percentiles: not measured.
Semantic review progress: 1254/1312 cases reviewed.

## Curated profile membership

These counts include only explicitly reviewed cases; unreviewed cases are not silently assigned to a profile.

| Profile | Reviewed cases |
| --- | ---: |
| `integration` | 634 |
| `nightly` | 241 |
| `performance` | 73 |
| `pr` | 404 |
| `visual` | 181 |

## Top recorded per-case runtimes

These are case-level observations recorded directly on case reviews. Inventory generation does not execute tests or refresh these measurements; they are not a full-profile runtime baseline.

| Runtime (ms) | Profile | Spec file | Test case |
| ---: | --- | --- | --- |
| 41600 | `performance`, `nightly` | `history-retention.spec.ts` | keeps long browser edit history within the documented retention horizon |
| 28400 | `visual` | `issue-441-ribbon-label-integrity.spec.ts` | Ribbon labels are intact across Cycle, Transaction and Combined at 1672x941 |
| 25200 | `visual` | `issue-441-ribbon-label-integrity.spec.ts` | Ribbon labels are intact across Cycle, Transaction and Combined at 1280x720 |
| 25100 | `visual` | `issue-441-ribbon-label-integrity.spec.ts` | Ribbon labels are intact across Cycle, Transaction and Combined at 1024x700 |
| 14000 | `pr` | `timeline-edits-stable-ids.spec.ts` | Timeline Delete range and Insert commit on a document with stable value IDs |
| 13900 | `pr` | `issue-753-bookmark-navigation-stays-in-app.spec.ts` | every Bookmark gesture stays inside the SPA in Combined mode |
| 13400 | `pr` | `issue-753-bookmark-navigation-stays-in-app.spec.ts` | every Bookmark gesture stays inside the SPA in Cycle mode |
| 12000 | `pr` | `combined-signal-pane-scroll.spec.ts` | Combined Signal rows scroll into view above the Bottom editor |
| 10600 | `visual` | `left-header-action-alignment.spec.ts` | right-aligns Left Tree header actions without changing command behavior |
| 10200 | `pr` | `issue-760-combined-horizontal-wheel.spec.ts` | Combined horizontal wheel scrolls the shared viewport at 1280x720 |
| 9700 | `visual` | `left-tree-compact-footer.spec.ts` | keeps the left tree footer compact at laptop viewport |
| 9300 | `pr` | `issue-753-bookmark-navigation-stays-in-app.spec.ts` | every Bookmark gesture stays inside the SPA in Transaction mode |
| 9000 | `integration` | `left-tree-interaction.spec.ts` | collapses only Left Tree descendants and restores stable rows without a canonical mutation |
| 9000 | `pr` | `redo-ctrl-y.spec.ts` | Ctrl+Y redoes what Ctrl+Z undid |
| 8800 | `pr` | `issue-750-geometry-10-to-50.spec.ts` | 1 TC = 10 cycles -> 50 cycles compresses bars 5x, keeps TC label pitch, never changes canonical cycles (1280x720) |
| 8700 | `pr` | `issue-750-custom-tc-scale.spec.ts` | Custom TC scale accepts only a positive integer and never applies an invalid draft |
| 8600 | `visual` | `issue-767-zoom-keeps-glyph-shape.spec.ts` | zoom does not stretch Transaction text at 1280x720 |
| 8100 | `pr` | `issue-767-zoom-keeps-glyph-shape.spec.ts` | a narrow Transaction bar keeps a body drag handle and can be moved |
| 7700 | `visual` | `left-pane-constraint.spec.ts` | left pane starts at the approved minimum without a resize jump (/) |
| 7600 | `pr` | `issue-744-diagnostics-freshness.spec.ts` | timing diagnostics stay current across a semantic edit, Undo and Redo (no silent clear) |

## Recorded spec-level runtimes

These values were measured for a whole spec file and are deliberately not copied into the case-level runtime table.

| Runtime (ms) | Profile | Spec file |
| ---: | --- | --- |
| 26233 | `visual` | `issue-441-ribbon-label-integrity.spec.ts` |
| 6500 | `integration`, `nightly` | `issue-757-far-scroll-window-coverage.spec.ts` |
| 5600 | `integration` | `issue-755-analytic-transition-equivalence.spec.ts` |
| 3600 | `integration`, `visual` | `issue-746-visible-group-create.spec.ts` |
| 952 | `performance`, `nightly` | `perf-fixed-full-span-open.spec.ts` |

> This is a complete name/location inventory, not a completed semantic review. 58 cases remain `UNREVIEWED` until their product invariant, layer, cost, tier, decision, and replacement mapping (if any) have been reviewed in the JSON manifest.

| Spec file | Cases | Review status |
| --- | ---: | --- |
| `acceptance-397-sample-a.spec.ts` | 4 | 4/4 reviewed |
| `acceptance-397-sample-c.spec.ts` | 7 | 7/7 reviewed |
| `acceptance-397-sample-d.spec.ts` | 4 | 4/4 reviewed |
| `acceptance-429-transaction-colors.spec.ts` | 4 | 4/4 reviewed |
| `acceptance-429-transaction-composition.spec.ts` | 32 | 32/32 reviewed |
| `advanced-json-apply-roundtrip.spec.ts` | 2 | 0/2 reviewed |
| `advanced-json-diagnostic.spec.ts` | 7 | 7/7 reviewed |
| `ai-bridge.spec.ts` | 14 | 14/14 reviewed |
| `ai-domain-coverage.spec.ts` | 1 | 1/1 reviewed |
| `ai-proposal-workflow.spec.ts` | 10 | 10/10 reviewed |
| `annotation-bottom-list.spec.ts` | 1 | 1/1 reviewed |
| `annotation-highlight-position-mode.spec.ts` | 3 | 2/3 reviewed |
| `annotation-inspector-anchor.spec.ts` | 1 | 1/1 reviewed |
| `annotation-line-rendering.spec.ts` | 4 | 4/4 reviewed |
| `annotation-marker-vertical-span.spec.ts` | 1 | 1/1 reviewed |
| `annotation-multi-select-font.spec.ts` | 1 | 1/1 reviewed |
| `annotation-multiline-and-export-shapes.spec.ts` | 7 | 7/7 reviewed |
| `annotation-presentation-controls.spec.ts` | 6 | 6/6 reviewed |
| `annotation-presentation.spec.ts` | 1 | 1/1 reviewed |
| `annotation-preview-update.spec.ts` | 3 | 3/3 reviewed |
| `annotation-snap.spec.ts` | 20 | 20/20 reviewed |
| `annotation-virtualization-closure.spec.ts` | 3 | 3/3 reviewed |
| `architecture-probe.spec.ts` | 1 | 1/1 reviewed |
| `arrange-disabled-reasons.spec.ts` | 1 | 1/1 reviewed |
| `arrange-menu-keyboard-nav.spec.ts` | 1 | 1/1 reviewed |
| `arrow-endpoint-drag.spec.ts` | 2 | 2/2 reviewed |
| `axis-break-compression.spec.ts` | 1 | 1/1 reviewed |
| `badge-parity.spec.ts` | 2 | 2/2 reviewed |
| `badge-visual-evidence.spec.ts` | 1 | 1/1 reviewed |
| `bottom-bookmark-navigation.spec.ts` | 2 | 2/2 reviewed |
| `bottom-context.spec.ts` | 5 | 5/5 reviewed |
| `bottom-editor-row-contrast.spec.ts` | 3 | 3/3 reviewed |
| `bottom-panel-cancel-apply-height.spec.ts` | 1 | 1/1 reviewed |
| `bottom-panel-full-width.spec.ts` | 2 | 2/2 reviewed |
| `bottom-splitter-interaction-closure.spec.ts` | 4 | 4/4 reviewed |
| `bottom-tab-header-visibility.spec.ts` | 2 | 2/2 reviewed |
| `bottom-transaction-fixed-target.spec.ts` | 8 | 0/8 reviewed |
| `bulk-registration-strict.spec.ts` | 2 | 2/2 reviewed |
| `callout-body-anchor-drag.spec.ts` | 3 | 3/3 reviewed |
| `checkbox-dark-color-scheme.spec.ts` | 1 | 1/1 reviewed |
| `clipboard-entity-parity.spec.ts` | 6 | 6/6 reviewed |
| `clock-generator-toolbar-icon-size.spec.ts` | 1 | 1/1 reviewed |
| `clock-presentation-closure.spec.ts` | 2 | 2/2 reviewed |
| `clock-preview.spec.ts` | 4 | 4/4 reviewed |
| `clockless-open-readiness.spec.ts` | 2 | 2/2 reviewed |
| `clockless-time-axis.spec.ts` | 7 | 7/7 reviewed |
| `combined-column-resize-alignment.spec.ts` | 2 | 2/2 reviewed |
| `combined-left-panel-transaction-tree.spec.ts` | 2 | 2/2 reviewed |
| `combined-long-fixture-acceptance.spec.ts` | 2 | 2/2 reviewed |
| `combined-signal-pane-scroll.spec.ts` | 1 | 1/1 reviewed |
| `combined-tree-add-menus.spec.ts` | 1 | 1/1 reviewed |
| `command-parity-delete.spec.ts` | 1 | 1/1 reviewed |
| `comment-row-draft-consistency.spec.ts` | 1 | 1/1 reviewed |
| `cursor-signal-split-late-pane.spec.ts` | 2 | 2/2 reviewed |
| `cycle-default-pitch.spec.ts` | 1 | 1/1 reviewed |
| `cycle-frozen-columns-scroll.spec.ts` | 2 | 2/2 reviewed |
| `cycle-ruler-long-document-pitch.spec.ts` | 1 | 1/1 reviewed |
| `cycle-scroll-pitch-invariant.spec.ts` | 2 | 2/2 reviewed |
| `design-system-foundation.spec.ts` | 1 | 1/1 reviewed |
| `diagnostic-aggregator.spec.ts` | 8 | 8/8 reviewed |
| `dialog-esc-lifecycle.spec.ts` | 2 | 1/2 reviewed |
| `document-properties.spec.ts` | 1 | 1/1 reviewed |
| `edge-counter-compact.spec.ts` | 5 | 5/5 reviewed |
| `edit-commit-contract.spec.ts` | 5 | 5/5 reviewed |
| `empty-group-tree-projection.spec.ts` | 3 | 3/3 reviewed |
| `event-pulse-lifecycle.spec.ts` | 2 | 2/2 reviewed |
| `export-diagnostics.spec.ts` | 2 | 2/2 reviewed |
| `export-fold-mapping.spec.ts` | 1 | 1/1 reviewed |
| `export-user-text-boundary.spec.ts` | 1 | 1/1 reviewed |
| `feature-showcase-startup.spec.ts` | 3 | 3/3 reviewed |
| `file-beforeunload-dirty-guard.spec.ts` | 3 | 1/3 reviewed |
| `file-operation-feedback.spec.ts` | 8 | 0/8 reviewed |
| `file-ribbon-blank-controls.spec.ts` | 1 | 1/1 reviewed |
| `find-replace-journey.spec.ts` | 3 | 3/3 reviewed |
| `font-style-commit-contract.spec.ts` | 1 | 1/1 reviewed |
| `full-gui.spec.ts` | 42 | 42/42 reviewed |
| `ghost-trace-delete.spec.ts` | 1 | 1/1 reviewed |
| `golden-samples.spec.ts` | 2 | 2/2 reviewed |
| `grid-zoom-alignment.spec.ts` | 1 | 1/1 reviewed |
| `group-band.spec.ts` | 3 | 3/3 reviewed |
| `group-clipboard-parity.spec.ts` | 4 | 4/4 reviewed |
| `gui-bottom-resize.spec.ts` | 1 | 1/1 reviewed |
| `gui-density-tokens.spec.ts` | 1 | 1/1 reviewed |
| `gui-inspector-resize.spec.ts` | 1 | 1/1 reviewed |
| `gui-left-pane-resize.spec.ts` | 2 | 2/2 reviewed |
| `gui-reference-v8.spec.ts` | 3 | 3/3 reviewed |
| `gui-split-view-visual.spec.ts` | 1 | 1/1 reviewed |
| `gui-v1-home-vocabulary.spec.ts` | 1 | 1/1 reviewed |
| `gui-v1-pane-vocabulary.spec.ts` | 1 | 1/1 reviewed |
| `gui-v1-ribbon-labels.spec.ts` | 1 | 1/1 reviewed |
| `gui-visual-acceptance.spec.ts` | 1 | 1/1 reviewed |
| `history-retention.spec.ts` | 1 | 1/1 reviewed |
| `home-command-surface.spec.ts` | 24 | 24/24 reviewed |
| `home-ribbon-timegroup-cleanup.spec.ts` | 1 | 1/1 reviewed |
| `icon-button-dialog-close.spec.ts` | 5 | 5/5 reviewed |
| `incremental-invalidation-matrix.spec.ts` | 1 | 1/1 reviewed |
| `insert-icon-semantics.spec.ts` | 3 | 3/3 reviewed |
| `insert-timeline-ribbon.spec.ts` | 10 | 10/10 reviewed |
| `inspector-accordion.spec.ts` | 2 | 2/2 reviewed |
| `inspector-capability.spec.ts` | 2 | 2/2 reviewed |
| `inspector-group-transaction-scroll.spec.ts` | 1 | 1/1 reviewed |
| `inspector-hide-compacts-rows.spec.ts` | 1 | 1/1 reviewed |
| `inspector-multi-selection.spec.ts` | 3 | 3/3 reviewed |
| `inspector-selection-context.contract.spec.ts` | 3 | 3/3 reviewed |
| `inspector-waveform-style.spec.ts` | 2 | 2/2 reviewed |
| `interaction-visual-scenarios.spec.ts` | 11 | 11/11 reviewed |
| `issue-1004-group-hierarchy.spec.ts` | 2 | 2/2 reviewed |
| `issue-1007-transaction-add-menu.spec.ts` | 4 | 4/4 reviewed |
| `issue-1055-signal-tree-offscreen-filter.spec.ts` | 1 | 1/1 reviewed |
| `issue-1072-cross-surface-alignment.spec.ts` | 2 | 2/2 reviewed |
| `issue-1080-transition-row-selection.spec.ts` | 1 | 0/1 reviewed |
| `issue-1099-scenario-context.spec.ts` | 7 | 0/7 reviewed |
| `issue-175-prefetch-scroll-layout.spec.ts` | 1 | 0/1 reviewed |
| `issue-175-scroll-group-header-dom.spec.ts` | 3 | 3/3 reviewed |
| `issue-175-scrollbar-effect-lifecycle.spec.ts` | 1 | 1/1 reviewed |
| `issue-175-scrollbar-geometry-matrix.spec.ts` | 2 | 2/2 reviewed |
| `issue-175-virtualized-group-start.spec.ts` | 1 | 0/1 reviewed |
| `issue-208-open-epoch-coherence.spec.ts` | 1 | 1/1 reviewed |
| `issue-219-wave-url-lifetime.spec.ts` | 4 | 4/4 reviewed |
| `issue-426-event-selection-scope.spec.ts` | 1 | 1/1 reviewed |
| `issue-426-external-bottom-draft-update.spec.ts` | 3 | 3/3 reviewed |
| `issue-426-inspector-bookmark-rebase.spec.ts` | 2 | 2/2 reviewed |
| `issue-431-bottom-presets.spec.ts` | 1 | 0/1 reviewed |
| `issue-431-bus-radix.spec.ts` | 2 | 2/2 reviewed |
| `issue-431-constraint-authoring.spec.ts` | 1 | 1/1 reviewed |
| `issue-431-constraint-problem-reveal.spec.ts` | 1 | 1/1 reviewed |
| `issue-431-enum-state-save-open.spec.ts` | 2 | 2/2 reviewed |
| `issue-431-handshake-missing-cases.spec.ts` | 1 | 1/1 reviewed |
| `issue-431-physical-timebase.spec.ts` | 1 | 1/1 reviewed |
| `issue-431-protocol-check-toggle.spec.ts` | 2 | 2/2 reviewed |
| `issue-431-scenario-lifecycle.spec.ts` | 2 | 2/2 reviewed |
| `issue-431-signal-pin.spec.ts` | 2 | 2/2 reviewed |
| `issue-431-signal-selection-groups.spec.ts` | 2 | 1/2 reviewed |
| `issue-440-mode-context-coherence.spec.ts` | 3 | 3/3 reviewed |
| `issue-440-pinned-bookmark-transaction.spec.ts` | 2 | 2/2 reviewed |
| `issue-441-ribbon-label-integrity.spec.ts` | 3 | 3/3 reviewed |
| `issue-456-sized-bus-literal.spec.ts` | 1 | 1/1 reviewed |
| `issue-549-cursor-multi-frame-drag.spec.ts` | 16 | 16/16 reviewed |
| `issue-554-transaction-journey.spec.ts` | 2 | 2/2 reviewed |
| `issue-573-combined-divider-pinned.spec.ts` | 1 | 1/1 reviewed |
| `issue-573-combined-shared-time-axis.spec.ts` | 3 | 3/3 reviewed |
| `issue-573-combined-single-hscroll.spec.ts` | 2 | 2/2 reviewed |
| `issue-593-inflight-mode-switch.spec.ts` | 2 | 2/2 reviewed |
| `issue-593-mode-layout-isolation.spec.ts` | 8 | 8/8 reviewed |
| `issue-593-mode-workspace-acceptance.spec.ts` | 2 | 2/2 reviewed |
| `issue-602-transition-start-reuse.spec.ts` | 1 | 0/1 reviewed |
| `issue-621-far-jump-no-rewindow-storm.spec.ts` | 1 | 1/1 reviewed |
| `issue-623-cycle-entry-settles-once.spec.ts` | 1 | 1/1 reviewed |
| `issue-624-cycle-reload-mode.spec.ts` | 2 | 2/2 reviewed |
| `issue-625-cycle-fixed-columns-scroll.spec.ts` | 2 | 2/2 reviewed |
| `issue-625-mode-geometry-unchanged.spec.ts` | 1 | 1/1 reviewed |
| `issue-625-no-bleed-under-fixed-columns.spec.ts` | 2 | 2/2 reviewed |
| `issue-626-primary-actions-visible.spec.ts` | 2 | 2/2 reviewed |
| `issue-628-annotation-bottom-collection.spec.ts` | 2 | 2/2 reviewed |
| `issue-630-active-mode-title.spec.ts` | 1 | 1/1 reviewed |
| `issue-631-transaction-vertical-lines.spec.ts` | 1 | 1/1 reviewed |
| `issue-635-derived-fields.spec.ts` | 2 | 2/2 reviewed |
| `issue-635-generator-pristine-draft.spec.ts` | 1 | 1/1 reviewed |
| `issue-635-signal-scope-actions.spec.ts` | 1 | 1/1 reviewed |
| `issue-635-transition-draft-signal-scope.spec.ts` | 1 | 1/1 reviewed |
| `issue-635-transition-form-mode.spec.ts` | 1 | 1/1 reviewed |
| `issue-637-sustained-scroll.spec.ts` | 1 | 1/1 reviewed |
| `issue-639-mode-scoped-bottom-selection.spec.ts` | 1 | 1/1 reviewed |
| `issue-639-transaction-create-cycle-bottom-tab.spec.ts` | 1 | 1/1 reviewed |
| `issue-646-tree-fixed-scroll.spec.ts` | 2 | 2/2 reviewed |
| `issue-650-transaction-select-reveal.spec.ts` | 2 | 2/2 reviewed |
| `issue-651-bulk-dialog-focus.spec.ts` | 2 | 2/2 reviewed |
| `issue-676-canvas-inspector-refresh.spec.ts` | 2 | 2/2 reviewed |
| `issue-698-color-toggle-and-compact-phases.spec.ts` | 2 | 2/2 reviewed |
| `issue-698-inspector-phases.spec.ts` | 1 | 1/1 reviewed |
| `issue-703-inline-row-apply.spec.ts` | 2 | 2/2 reviewed |
| `issue-704-shared-chevron.spec.ts` | 1 | 1/1 reviewed |
| `issue-714-table-header-and-swatch.spec.ts` | 2 | 2/2 reviewed |
| `issue-720-control-affordance-audit.spec.ts` | 6 | 6/6 reviewed |
| `issue-720-cursor-and-disabled-audit.spec.ts` | 6 | 6/6 reviewed |
| `issue-720-disabled-reasons.spec.ts` | 1 | 1/1 reviewed |
| `issue-720-gesture-status-hint.spec.ts` | 3 | 3/3 reviewed |
| `issue-720-keyboard-parity.spec.ts` | 3 | 3/3 reviewed |
| `issue-720-menu-dialog-affordance.spec.ts` | 2 | 2/2 reviewed |
| `issue-721-visual-channels.spec.ts` | 3 | 3/3 reviewed |
| `issue-722-display-scale-125.spec.ts` | 2 | 2/2 reviewed |
| `issue-723-status-diagnostics.spec.ts` | 1 | 1/1 reviewed |
| `issue-724-search-scope.spec.ts` | 1 | 1/1 reviewed |
| `issue-725-keyboard-journey.spec.ts` | 2 | 2/2 reviewed |
| `issue-726-lane-hover.spec.ts` | 1 | 1/1 reviewed |
| `issue-726-marker-hierarchy.spec.ts` | 1 | 1/1 reviewed |
| `issue-726-transaction-lane-visual-hierarchy.spec.ts` | 2 | 2/2 reviewed |
| `issue-727-minimap-affordance.spec.ts` | 1 | 1/1 reviewed |
| `issue-728-group-double-click.spec.ts` | 1 | 1/1 reviewed |
| `issue-729-dirty-title.spec.ts` | 1 | 1/1 reviewed |
| `issue-738-hit-mapping-after-scale-scroll.spec.ts` | 2 | 2/2 reviewed |
| `issue-738-native-thumb-ruler-hit.spec.ts` | 2 | 2/2 reviewed |
| `issue-738-ruler-hit-area.spec.ts` | 3 | 3/3 reviewed |
| `issue-738-ruler-origin-after-scroll-return.spec.ts` | 5 | 5/5 reviewed |
| `issue-738-stress-real-input.spec.ts` | 2 | 2/2 reviewed |
| `issue-738-stress-rebase.spec.ts` | 4 | 4/4 reviewed |
| `issue-738-zoom-window-coordinate.spec.ts` | 1 | 1/1 reviewed |
| `issue-740-741-756-cycle-layout.spec.ts` | 2 | 2/2 reviewed |
| `issue-740-cycle-bottom-hidden.spec.ts` | 1 | 1/1 reviewed |
| `issue-744-diagnostics-freshness.spec.ts` | 2 | 2/2 reviewed |
| `issue-746-visible-group-create.spec.ts` | 1 | 1/1 reviewed |
| `issue-747-a11y-and-sort-matrix.spec.ts` | 1 | 1/1 reviewed |
| `issue-747-bottom-settings.spec.ts` | 2 | 2/2 reviewed |
| `issue-747-geometry-acceptance.spec.ts` | 1 | 1/1 reviewed |
| `issue-748-add-and-focus-journey.spec.ts` | 1 | 1/1 reviewed |
| `issue-748-transaction-left-header.spec.ts` | 1 | 1/1 reviewed |
| `issue-748-tree-menu-and-parity.spec.ts` | 1 | 1/1 reviewed |
| `issue-749-move-to-group-submenu.spec.ts` | 2 | 2/2 reviewed |
| `issue-750-custom-tc-scale.spec.ts` | 1 | 1/1 reviewed |
| `issue-750-geometry-10-to-50.spec.ts` | 2 | 2/2 reviewed |
| `issue-750-ruler-follows-tc-scale.spec.ts` | 1 | 1/1 reviewed |
| `issue-750-tc-scale-selector.spec.ts` | 1 | 1/1 reviewed |
| `issue-751-bottom-phase-editor.spec.ts` | 1 | 1/1 reviewed |
| `issue-752-bottom-remount.spec.ts` | 1 | 1/1 reviewed |
| `issue-753-bookmark-gesture-fuzz.spec.ts` | 5 | 5/5 reviewed |
| `issue-753-bookmark-navigation-no-crash.spec.ts` | 3 | 3/3 reviewed |
| `issue-753-bookmark-navigation-stays-in-app.spec.ts` | 3 | 3/3 reviewed |
| `issue-753-stress-classified.spec.ts` | 3 | 3/3 reviewed |
| `issue-755-analytic-transition-equivalence.spec.ts` | 1 | 1/1 reviewed |
| `issue-755-canvas-production-acceptance.spec.ts` | 5 | 5/5 reviewed |
| `issue-757-far-scroll-window-coverage.spec.ts` | 1 | 1/1 reviewed |
| `issue-759-group-disclosure-shared.spec.ts` | 1 | 1/1 reviewed |
| `issue-760-combined-horizontal-wheel.spec.ts` | 1 | 1/1 reviewed |
| `issue-761-start-input-width.spec.ts` | 1 | 1/1 reviewed |
| `issue-763-retained-phase-drafts.spec.ts` | 2 | 2/2 reviewed |
| `issue-764-group-header-sticky.spec.ts` | 2 | 2/2 reviewed |
| `issue-765-transaction-no-phantom-vscroll.spec.ts` | 3 | 3/3 reviewed |
| `issue-766-cycle-plural.spec.ts` | 1 | 1/1 reviewed |
| `issue-767-zoom-keeps-glyph-shape.spec.ts` | 3 | 3/3 reviewed |
| `issue-768-mode-switch-budget.spec.ts` | 1 | 1/1 reviewed |
| `issue-769-tree-virtualization-keyboard.spec.ts` | 5 | 5/5 reviewed |
| `issue-770-filtered-selection-scope.spec.ts` | 2 | 2/2 reviewed |
| `issue-771-many-small-groups-virtualized.spec.ts` | 1 | 1/1 reviewed |
| `issue-772-retained-bookmark-drafts.spec.ts` | 2 | 2/2 reviewed |
| `issue-773-bottom-tab-round-trip.spec.ts` | 1 | 1/1 reviewed |
| `issue-774-visibility-preserves-selection.spec.ts` | 2 | 2/2 reviewed |
| `issue-775-annotation-draft-isolation.spec.ts` | 1 | 1/1 reviewed |
| `issue-776-signal-inspector-draft-sync.spec.ts` | 2 | 2/2 reviewed |
| `issue-777-current-samples-interaction.spec.ts` | 16 | 16/16 reviewed |
| `issue-777-current-samples-open-save-roundtrip.spec.ts` | 12 | 12/12 reviewed |
| `issue-777-current-v2-samples-acceptance.spec.ts` | 14 | 14/14 reviewed |
| `issue-787-canvas-lifecycle.spec.ts` | 1 | 1/1 reviewed |
| `issue-789-recent-storage-bound.spec.ts` | 4 | 4/4 reviewed |
| `issue-797-group-opacity-acceptance.spec.ts` | 2 | 2/2 reviewed |
| `issue-798-menu-exclusivity.spec.ts` | 2 | 2/2 reviewed |
| `issue-799-orphan-divider.spec.ts` | 7 | 7/7 reviewed |
| `issue-835-async-annotation-import.spec.ts` | 6 | 6/6 reviewed |
| `issue-836-hardware-hierarchy-performance.spec.ts` | 1 | 1/1 reviewed |
| `issue-837-legend-cancel-draft.spec.ts` | 6 | 4/6 reviewed |
| `issue-838-visible-hierarchy-copy-selection.spec.ts` | 1 | 1/1 reviewed |
| `issue-839-large-showcase-clock-phase.spec.ts` | 2 | 2/2 reviewed |
| `issue-840-stale-cycle-context.spec.ts` | 2 | 2/2 reviewed |
| `issue-841-legend-bounds.spec.ts` | 7 | 7/7 reviewed |
| `issue-842-clean-event-row-rebase.spec.ts` | 1 | 1/1 reviewed |
| `issue-847-inflight-mode-switch.spec.ts` | 4 | 4/4 reviewed |
| `issue-847-prefetch-mode-roundtrip.spec.ts` | 2 | 2/2 reviewed |
| `issue-847-vertical-scroll-user-input.spec.ts` | 2 | 2/2 reviewed |
| `issue-847-vertical-scroll-wave-ownership.spec.ts` | 4 | 4/4 reviewed |
| `issue-856-bottom-annotation-scroll-cost.spec.ts` | 1 | 1/1 reviewed |
| `issue-856-bottom-event-table-scroll-cost.spec.ts` | 1 | 1/1 reviewed |
| `issue-856-bottom-transaction-scroll-cost.spec.ts` | 1 | 1/1 reviewed |
| `issue-856-event-row-reuse.spec.ts` | 1 | 1/1 reviewed |
| `issue-863-annotation-scroll-cost.spec.ts` | 1 | 1/1 reviewed |
| `issue-863-viewport-cache-invalidation.spec.ts` | 4 | 4/4 reviewed |
| `issue-864-bulk-clipboard-one-history.spec.ts` | 1 | 1/1 reviewed |
| `issue-864-bulk-clipboard-scale.spec.ts` | 18 | 18/18 reviewed |
| `issue-865-transaction-window-matrix.spec.ts` | 4 | 4/4 reviewed |
| `issue-869-minimap-single-edit-incremental.spec.ts` | 1 | 1/1 reviewed |
| `issue-869-minimap-transaction-incremental.spec.ts` | 3 | 3/3 reviewed |
| `issue-890-annotation-signal-picker-10k.spec.ts` | 1 | 1/1 reviewed |
| `issue-895-canvas-wave-semantics.spec.ts` | 1 | 1/1 reviewed |
| `issue-896-implicit-reference-window.spec.ts` | 1 | 1/1 reviewed |
| `issue-897-context-menu-target.spec.ts` | 2 | 2/2 reviewed |
| `issue-898-signal-visibility-overlay.spec.ts` | 1 | 1/1 reviewed |
| `issue-900-spacer-presentation.spec.ts` | 1 | 1/1 reviewed |
| `issue-901-ruler-row-origin.spec.ts` | 1 | 1/1 reviewed |
| `issue-933-transaction-identity-lifecycle.spec.ts` | 1 | 1/1 reviewed |
| `issue-933-transaction-identity-long-range.spec.ts` | 2 | 2/2 reviewed |
| `issue-933-transaction-lane-identity.spec.ts` | 1 | 1/1 reviewed |
| `issue-936-folded-windowed-annotation.spec.ts` | 3 | 3/3 reviewed |
| `issue-936-multi-fold-anchor-types.spec.ts` | 2 | 2/2 reviewed |
| `issue-937-remaining-closure.spec.ts` | 8 | 8/8 reviewed |
| `issue-937-signal-split-coordinate-matrix.spec.ts` | 5 | 5/5 reviewed |
| `issue-937-time-axis-coordinate-matrix.spec.ts` | 3 | 3/3 reviewed |
| `issue-937-transaction-coordinate-matrix.spec.ts` | 4 | 4/4 reviewed |
| `issue-945-transaction-scrollbar-interactions.spec.ts` | 4 | 4/4 reviewed |
| `issue-945-transaction-scrollbar-stability.spec.ts` | 2 | 2/2 reviewed |
| `keyboard-shortcut-router.spec.ts` | 4 | 4/4 reviewed |
| `keyboard-tabs-resizers.spec.ts` | 2 | 2/2 reviewed |
| `label-anchor-source-display.spec.ts` | 1 | 1/1 reviewed |
| `layout-inspector.spec.ts` | 9 | 9/9 reviewed |
| `left-header-action-alignment.spec.ts` | 1 | 1/1 reviewed |
| `left-pane-constraint.spec.ts` | 2 | 2/2 reviewed |
| `left-tree-action-icons.spec.ts` | 1 | 1/1 reviewed |
| `left-tree-compact-footer.spec.ts` | 2 | 2/2 reviewed |
| `left-tree-critical-icons.spec.ts` | 1 | 1/1 reviewed |
| `left-tree-interaction.spec.ts` | 3 | 3/3 reviewed |
| `left-tree-menu-contrast.spec.ts` | 1 | 1/1 reviewed |
| `left-tree-projection-policy-correction.spec.ts` | 2 | 2/2 reviewed |
| `left-tree-type-filter.spec.ts` | 2 | 2/2 reviewed |
| `legend-canvas-anchor.spec.ts` | 1 | 0/1 reviewed |
| `listener-lifecycle.spec.ts` | 2 | 2/2 reviewed |
| `local-geometry-dom-batch.spec.ts` | 1 | 1/1 reviewed |
| `measurement-anchor-drag.spec.ts` | 5 | 5/5 reviewed |
| `measurement-dimension-layout.spec.ts` | 1 | 1/1 reviewed |
| `measurement-export-matrix.spec.ts` | 1 | 1/1 reviewed |
| `measurement-lane-stacking.spec.ts` | 3 | 3/3 reviewed |
| `measurement-top-row-clip.spec.ts` | 2 | 2/2 reviewed |
| `minimal-cycle-view.spec.ts` | 3 | 3/3 reviewed |
| `minimap-default-off.spec.ts` | 1 | 0/1 reviewed |
| `minimap-overview-performance.spec.ts` | 4 | 4/4 reviewed |
| `minimap-viewport-closure.spec.ts` | 1 | 1/1 reviewed |
| `mode-isolation-journey.spec.ts` | 2 | 2/2 reviewed |
| `name-draft-identity.spec.ts` | 1 | 1/1 reviewed |
| `open-progressive-wave-yield.spec.ts` | 3 | 3/3 reviewed |
| `open-validation-handoff.spec.ts` | 3 | 3/3 reviewed |
| `perf-755-far-jump-longtask.spec.ts` | 1 | 1/1 reviewed |
| `perf-fixed-full-span-open.spec.ts` | 5 | 5/5 reviewed |
| `performance-closure.spec.ts` | 11 | 11/11 reviewed |
| `performance-internal-latency.spec.ts` | 1 | 1/1 reviewed |
| `performance-view-only-validation.spec.ts` | 1 | 1/1 reviewed |
| `pinned-bottom-target.spec.ts` | 10 | 4/10 reviewed |
| `production-presentation-equivalence.spec.ts` | 1 | 1/1 reviewed |
| `qa-cross-mode-journey.spec.ts` | 2 | 2/2 reviewed |
| `qa-fresh-state-journeys.spec.ts` | 9 | 9/9 reviewed |
| `redo-ctrl-y.spec.ts` | 1 | 1/1 reviewed |
| `reference-clock-conversion.spec.ts` | 4 | 4/4 reviewed |
| `release-legacy-migration.spec.ts` | 2 | 0/2 reviewed |
| `reorder-visibility.spec.ts` | 8 | 8/8 reviewed |
| `reset-semantics-inspector.spec.ts` | 2 | 2/2 reviewed |
| `resource-budget-ui-routes.spec.ts` | 8 | 7/8 reviewed |
| `result-aware-create-effects.spec.ts` | 2 | 2/2 reviewed |
| `review-checks-refresh.spec.ts` | 2 | 2/2 reviewed |
| `review-workflow.spec.ts` | 3 | 3/3 reviewed |
| `ribbon-caption-layout.spec.ts` | 2 | 2/2 reviewed |
| `ribbon-cursor-ab.spec.ts` | 4 | 4/4 reviewed |
| `ribbon-layout.spec.ts` | 2 | 2/2 reviewed |
| `ribbon-more-popover-closure.spec.ts` | 4 | 4/4 reviewed |
| `ribbon-responsive-overflow.spec.ts` | 3 | 3/3 reviewed |
| `ribbon-tabs.spec.ts` | 5 | 5/5 reviewed |
| `ribbon-transaction-context.spec.ts` | 3 | 3/3 reviewed |
| `ribbon-visual-scenario-matrix.spec.ts` | 2 | 2/2 reviewed |
| `ruler-reference-clock.spec.ts` | 2 | 2/2 reviewed |
| `ruler-terminal-boundary.spec.ts` | 1 | 1/1 reviewed |
| `runtime-owner-acceptance.spec.ts` | 2 | 2/2 reviewed |
| `signal-editor-draft-survives-unrelated-edit.spec.ts` | 1 | 1/1 reviewed |
| `signal-editor-group-dropdown.spec.ts` | 2 | 2/2 reviewed |
| `signal-editor.spec.ts` | 18 | 18/18 reviewed |
| `signal-event-table-draft-hint.spec.ts` | 1 | 1/1 reviewed |
| `signal-filter-clear-affordance.spec.ts` | 1 | 1/1 reviewed |
| `signal-generator.spec.ts` | 5 | 5/5 reviewed |
| `signal-spacing.spec.ts` | 3 | 3/3 reviewed |
| `signal-split-no-assignment-control.spec.ts` | 1 | 1/1 reviewed |
| `signal-split-render-routing.spec.ts` | 3 | 3/3 reviewed |
| `signal-split.spec.ts` | 1 | 1/1 reviewed |
| `signal-type-label-registry.spec.ts` | 2 | 2/2 reviewed |
| `signal-visibility-recover.spec.ts` | 1 | 1/1 reviewed |
| `spacer-clipboard-reorder.spec.ts` | 2 | 2/2 reviewed |
| `spacer-row.spec.ts` | 1 | 1/1 reviewed |
| `spacer.spec.ts` | 1 | 1/1 reviewed |
| `split-active-pane.spec.ts` | 6 | 6/6 reviewed |
| `splitter-view-state.contract.spec.ts` | 3 | 3/3 reviewed |
| `stable-id-collision.spec.ts` | 1 | 1/1 reviewed |
| `stable-surface.spec.ts` | 1 | 1/1 reviewed |
| `status-context.spec.ts` | 4 | 4/4 reviewed |
| `time-group-lifecycle.spec.ts` | 1 | 1/1 reviewed |
| `time-mapping-scale-closure.spec.ts` | 1 | 1/1 reviewed |
| `timeline-editor.spec.ts` | 29 | 29/29 reviewed |
| `timeline-edits-stable-ids.spec.ts` | 1 | 1/1 reviewed |
| `timeline-range-100k.spec.ts` | 3 | 3/3 reviewed |
| `timeline-range-band-presentation.spec.ts` | 9 | 9/9 reviewed |
| `timeline-range-edit-readability.spec.ts` | 3 | 3/3 reviewed |
| `timeline-range-hitarea-closure.spec.ts` | 5 | 5/5 reviewed |
| `timing-grid-x-scale-closure.spec.ts` | 1 | 1/1 reviewed |
| `titlebar-controls.spec.ts` | 1 | 1/1 reviewed |
| `transaction-add-below-selected.spec.ts` | 1 | 1/1 reviewed |
| `transaction-bottom-draft.contract.spec.ts` | 1 | 1/1 reviewed |
| `transaction-bottom-panel-table-first.spec.ts` | 1 | 1/1 reviewed |
| `transaction-bottom-panel-table.spec.ts` | 2 | 2/2 reviewed |
| `transaction-bottom-phase-linked-signals.spec.ts` | 2 | 2/2 reviewed |
| `transaction-bottom-toolbar-add-ungroup.spec.ts` | 1 | 1/1 reviewed |
| `transaction-drag.spec.ts` | 11 | 11/11 reviewed |
| `transaction-empty-state-create-lane-fix.spec.ts` | 1 | 1/1 reviewed |
| `transaction-export.spec.ts` | 16 | 16/16 reviewed |
| `transaction-group-management.spec.ts` | 4 | 4/4 reviewed |
| `transaction-gui-authoring.spec.ts` | 2 | 2/2 reviewed |
| `transaction-inspector-apply-validation.spec.ts` | 3 | 3/3 reviewed |
| `transaction-inspector-bottom-draft-sync.spec.ts` | 1 | 1/1 reviewed |
| `transaction-inspector-duration-tc.spec.ts` | 1 | 1/1 reviewed |
| `transaction-inspector-lane-suggestions.spec.ts` | 1 | 1/1 reviewed |
| `transaction-lane-labels-visible.spec.ts` | 2 | 2/2 reviewed |
| `transaction-lane-scaling.spec.ts` | 13 | 13/13 reviewed |
| `transaction-minimap-overview.spec.ts` | 2 | 2/2 reviewed |
| `transaction-onboarding.spec.ts` | 7 | 7/7 reviewed |
| `transaction-partial-update-preserves-fields.spec.ts` | 1 | 1/1 reviewed |
| `transaction-phase-bars.spec.ts` | 6 | 4/6 reviewed |
| `transaction-ribbon-groups.spec.ts` | 1 | 1/1 reviewed |
| `transaction-selection-smoke.spec.ts` | 1 | 1/1 reviewed |
| `transaction-selection.contract.spec.ts` | 3 | 3/3 reviewed |
| `transaction-signal-picker.spec.ts` | 4 | 4/4 reviewed |
| `transaction-startup-fixture-matrix.spec.ts` | 4 | 4/4 reviewed |
| `transaction-startup-large-fixture.spec.ts` | 2 | 2/2 reviewed |
| `transaction-startup-metrics.spec.ts` | 2 | 2/2 reviewed |
| `transaction-table-name-column-alignment.spec.ts` | 1 | 1/1 reviewed |
| `transaction-time-scale.spec.ts` | 3 | 3/3 reviewed |
| `transaction-tree-control-parity.spec.ts` | 2 | 2/2 reviewed |
| `transaction-tree-filter.spec.ts` | 1 | 1/1 reviewed |
| `transaction-tree-group-new-transaction.spec.ts` | 1 | 1/1 reviewed |
| `transaction-tree-long-name.spec.ts` | 1 | 1/1 reviewed |
| `transaction-tree-menu-overlay.spec.ts` | 2 | 2/2 reviewed |
| `transaction-tree-more-menu-visible.spec.ts` | 1 | 1/1 reviewed |
| `transaction-tree-no-frozen-pane-handle.spec.ts` | 1 | 1/1 reviewed |
| `transaction-viewport-hscroll.spec.ts` | 1 | 1/1 reviewed |
| `tree-drag-drop.spec.ts` | 5 | 5/5 reviewed |
| `tree-keyboard.spec.ts` | 2 | 2/2 reviewed |
| `undo-redo-selection-context.spec.ts` | 11 | 4/11 reviewed |
| `unsaved-file-dialog.spec.ts` | 15 | 14/15 reviewed |
| `v8-gui-contract-coverage.spec.ts` | 1 | 1/1 reviewed |
| `value-label-layout.spec.ts` | 1 | 1/1 reviewed |
| `value-signal-compatibility.spec.ts` | 7 | 7/7 reviewed |
| `view-metrics-owner.spec.ts` | 1 | 1/1 reviewed |
| `view-mode-readability.spec.ts` | 3 | 3/3 reviewed |
| `view-ribbon-slot.spec.ts` | 8 | 8/8 reviewed |
| `visual-grammar-cross-component.spec.ts` | 2 | 2/2 reviewed |
| `visual-reference-lifecycle.spec.ts` | 1 | 1/1 reviewed |
| `visual-regression-modes.spec.ts` | 6 | 6/6 reviewed |
| `wavedrom-security.spec.ts` | 1 | 1/1 reviewed |
| `wavedrom-shared-definitions.spec.ts` | 1 | 1/1 reviewed |
| `workspace-preset-density.spec.ts` | 1 | 1/1 reviewed |
| `workspace-zoom-isolation.spec.ts` | 2 | 2/2 reviewed |
| `zoom-cross-surface-alignment.spec.ts` | 1 | 1/1 reviewed |
| `zoom-text-fidelity.spec.ts` | 5 | 5/5 reviewed |

## Static review candidates

The following source-pattern signals are triage hints only; they do not prove that a test is invalid or implementation-coupled. Inspect the case and protected contract before deciding.

| Spec file | Candidate signals |
| --- | --- |
| `acceptance-397-sample-a.spec.ts` | geometryRead |
| `acceptance-397-sample-c.spec.ts` | querySelector |
| `acceptance-397-sample-d.spec.ts` | dataset |
| `acceptance-429-transaction-colors.spec.ts` | getComputedStyle |
| `annotation-multi-select-font.spec.ts` | querySelector, dataset |
| `annotation-presentation-controls.spec.ts` | querySelector, getComputedStyle |
| `badge-parity.spec.ts` | querySelector, getComputedStyle, geometryRead |
| `badge-visual-evidence.spec.ts` | geometryRead |
| `bottom-editor-row-contrast.spec.ts` | getComputedStyle |
| `bottom-panel-cancel-apply-height.spec.ts` | geometryRead |
| `bottom-panel-full-width.spec.ts` | geometryRead |
| `bottom-tab-header-visibility.spec.ts` | getComputedStyle, dataset, geometryRead |
| `checkbox-dark-color-scheme.spec.ts` | getComputedStyle |
| `clockless-time-axis.spec.ts` | dataset, geometryRead |
| `cursor-signal-split-late-pane.spec.ts` | querySelector, dataset, geometryRead |
| `cycle-default-pitch.spec.ts` | querySelector, getComputedStyle, geometryRead, explicitWait |
| `cycle-frozen-columns-scroll.spec.ts` | getComputedStyle |
| `design-system-foundation.spec.ts` | querySelector, getComputedStyle, directDomMutation, geometryRead |
| `edge-counter-compact.spec.ts` | querySelector, geometryRead |
| `empty-group-tree-projection.spec.ts` | dataset, explicitWait |
| `feature-showcase-startup.spec.ts` | geometryRead |
| `file-ribbon-blank-controls.spec.ts` | getComputedStyle, geometryRead |
| `find-replace-journey.spec.ts` | dataset |
| `full-gui.spec.ts` | geometryRead |
| `gui-density-tokens.spec.ts` | getComputedStyle |
| `gui-left-pane-resize.spec.ts` | getComputedStyle, geometryRead |
| `gui-reference-v8.spec.ts` | getComputedStyle, dataset, geometryRead |
| `gui-visual-acceptance.spec.ts` | getComputedStyle, geometryRead |
| `home-command-surface.spec.ts` | querySelector, dataset, geometryRead |
| `insert-icon-semantics.spec.ts` | querySelector, geometryRead |
| `insert-timeline-ribbon.spec.ts` | getComputedStyle, dataset, geometryRead |
| `inspector-hide-compacts-rows.spec.ts` | dataset, geometryRead |
| `issue-1004-group-hierarchy.spec.ts` | querySelector, getComputedStyle, geometryRead |
| `issue-1072-cross-surface-alignment.spec.ts` | geometryRead |
| `issue-1080-transition-row-selection.spec.ts` | querySelector |
| `issue-175-prefetch-scroll-layout.spec.ts` | dataset |
| `issue-175-scroll-group-header-dom.spec.ts` | dataset |
| `issue-175-scrollbar-geometry-matrix.spec.ts` | geometryRead |
| `issue-175-virtualized-group-start.spec.ts` | dataset |
| `issue-208-open-epoch-coherence.spec.ts` | querySelector |
| `issue-219-wave-url-lifetime.spec.ts` | querySelector, explicitWait |
| `issue-431-bus-radix.spec.ts` | querySelector |
| `issue-431-scenario-lifecycle.spec.ts` | getComputedStyle |
| `issue-431-signal-selection-groups.spec.ts` | dataset |
| `issue-441-ribbon-label-integrity.spec.ts` | getComputedStyle, geometryRead |
| `issue-549-cursor-multi-frame-drag.spec.ts` | dataset |
| `issue-573-combined-shared-time-axis.spec.ts` | geometryRead, explicitWait |
| `issue-573-combined-single-hscroll.spec.ts` | getComputedStyle, elementContains, geometryRead, explicitWait |
| `issue-593-inflight-mode-switch.spec.ts` | querySelector, getComputedStyle, dataset, geometryRead, explicitWait |
| `issue-593-mode-layout-isolation.spec.ts` | dataset, geometryRead, explicitWait |
| `issue-593-mode-workspace-acceptance.spec.ts` | querySelector, getComputedStyle, dataset, geometryRead, explicitWait |
| `issue-623-cycle-entry-settles-once.spec.ts` | querySelector, geometryRead |
| `issue-624-cycle-reload-mode.spec.ts` | querySelector, elementContains |
| `issue-625-cycle-fixed-columns-scroll.spec.ts` | geometryRead, explicitWait |
| `issue-625-mode-geometry-unchanged.spec.ts` | querySelector, geometryRead, explicitWait |
| `issue-625-no-bleed-under-fixed-columns.spec.ts` | querySelector, geometryRead, explicitWait |
| `issue-628-annotation-bottom-collection.spec.ts` | getComputedStyle, geometryRead |
| `issue-631-transaction-vertical-lines.spec.ts` | querySelector, getComputedStyle, geometryRead |
| `issue-637-sustained-scroll.spec.ts` | querySelector |
| `issue-650-transaction-select-reveal.spec.ts` | geometryRead |
| `issue-698-color-toggle-and-compact-phases.spec.ts` | geometryRead |
| `issue-714-table-header-and-swatch.spec.ts` | querySelector, getComputedStyle, geometryRead |
| `issue-720-control-affordance-audit.spec.ts` | querySelector, getComputedStyle, geometryRead |
| `issue-720-cursor-and-disabled-audit.spec.ts` | getComputedStyle, geometryRead |
| `issue-720-menu-dialog-affordance.spec.ts` | geometryRead |
| `issue-721-visual-channels.spec.ts` | getComputedStyle |
| `issue-722-display-scale-125.spec.ts` | geometryRead |
| `issue-723-status-diagnostics.spec.ts` | querySelector, geometryRead |
| `issue-725-keyboard-journey.spec.ts` | geometryRead |
| `issue-726-lane-hover.spec.ts` | getComputedStyle |
| `issue-726-marker-hierarchy.spec.ts` | getComputedStyle |
| `issue-726-transaction-lane-visual-hierarchy.spec.ts` | getComputedStyle, geometryRead, explicitWait |
| `issue-738-hit-mapping-after-scale-scroll.spec.ts` | dataset, geometryRead |
| `issue-738-native-thumb-ruler-hit.spec.ts` | dataset, geometryRead |
| `issue-738-ruler-hit-area.spec.ts` | dataset, geometryRead |
| `issue-738-ruler-origin-after-scroll-return.spec.ts` | dataset, geometryRead |
| `issue-738-stress-real-input.spec.ts` | dataset, geometryRead |
| `issue-738-stress-rebase.spec.ts` | dataset, geometryRead |
| `issue-738-zoom-window-coordinate.spec.ts` | dataset, geometryRead |
| `issue-740-741-756-cycle-layout.spec.ts` | querySelector, getComputedStyle, geometryRead |
| `issue-740-cycle-bottom-hidden.spec.ts` | querySelector, geometryRead |
| `issue-746-visible-group-create.spec.ts` | querySelector, geometryRead |
| `issue-747-a11y-and-sort-matrix.spec.ts` | dataset |
| `issue-747-bottom-settings.spec.ts` | geometryRead |
| `issue-747-geometry-acceptance.spec.ts` | querySelector, geometryRead |
| `issue-748-tree-menu-and-parity.spec.ts` | geometryRead |
| `issue-750-geometry-10-to-50.spec.ts` | querySelector, dataset, geometryRead |
| `issue-750-ruler-follows-tc-scale.spec.ts` | dataset |
| `issue-751-bottom-phase-editor.spec.ts` | querySelector |
| `issue-753-bookmark-gesture-fuzz.spec.ts` | querySelector, explicitWait |
| `issue-753-bookmark-navigation-no-crash.spec.ts` | querySelector, explicitWait |
| `issue-755-canvas-production-acceptance.spec.ts` | querySelector, dataset, geometryRead |
| `issue-757-far-scroll-window-coverage.spec.ts` | querySelector, geometryRead |
| `issue-759-group-disclosure-shared.spec.ts` | querySelector |
| `issue-760-combined-horizontal-wheel.spec.ts` | querySelector |
| `issue-761-start-input-width.spec.ts` | geometryRead |
| `issue-764-group-header-sticky.spec.ts` | querySelector, elementContains, geometryRead |
| `issue-765-transaction-no-phantom-vscroll.spec.ts` | explicitWait |
| `issue-767-zoom-keeps-glyph-shape.spec.ts` | getComputedStyle, dataset, geometryRead |
| `issue-768-mode-switch-budget.spec.ts` | querySelector |
| `issue-770-filtered-selection-scope.spec.ts` | querySelector |
| `issue-771-many-small-groups-virtualized.spec.ts` | querySelector |
| `issue-777-current-samples-interaction.spec.ts` | geometryRead |
| `issue-787-canvas-lifecycle.spec.ts` | explicitWait |
| `issue-789-recent-storage-bound.spec.ts` | elementContains |
| `issue-797-group-opacity-acceptance.spec.ts` | querySelector, getComputedStyle, explicitWait |
| `issue-799-orphan-divider.spec.ts` | getComputedStyle, dataset, geometryRead |
| `issue-839-large-showcase-clock-phase.spec.ts` | querySelector |
| `issue-841-legend-bounds.spec.ts` | dataset, geometryRead |
| `issue-847-inflight-mode-switch.spec.ts` | querySelector, dataset, geometryRead, explicitWait |
| `issue-847-prefetch-mode-roundtrip.spec.ts` | querySelector, dataset, geometryRead |
| `issue-847-vertical-scroll-user-input.spec.ts` | querySelector, dataset, geometryRead, explicitWait |
| `issue-847-vertical-scroll-wave-ownership.spec.ts` | querySelector, dataset, geometryRead |
| `issue-856-bottom-annotation-scroll-cost.spec.ts` | querySelector |
| `issue-856-bottom-event-table-scroll-cost.spec.ts` | querySelector |
| `issue-856-bottom-transaction-scroll-cost.spec.ts` | querySelector |
| `issue-863-annotation-scroll-cost.spec.ts` | querySelector, dataset, geometryRead |
| `issue-863-viewport-cache-invalidation.spec.ts` | dataset, geometryRead, explicitWait |
| `issue-865-transaction-window-matrix.spec.ts` | querySelector, explicitWait |
| `issue-895-canvas-wave-semantics.spec.ts` | dataset, styleMutation, directDomMutation |
| `issue-896-implicit-reference-window.spec.ts` | dataset, explicitWait |
| `issue-897-context-menu-target.spec.ts` | querySelector, explicitWait |
| `issue-901-ruler-row-origin.spec.ts` | querySelector, geometryRead |
| `issue-933-transaction-identity-long-range.spec.ts` | dataset, geometryRead |
| `issue-936-folded-windowed-annotation.spec.ts` | dataset, geometryRead |
| `issue-937-remaining-closure.spec.ts` | dataset, geometryRead, explicitWait |
| `issue-937-signal-split-coordinate-matrix.spec.ts` | dataset, geometryRead, explicitWait |
| `issue-937-time-axis-coordinate-matrix.spec.ts` | querySelector, dataset, geometryRead, explicitWait |
| `issue-937-transaction-coordinate-matrix.spec.ts` | dataset, geometryRead |
| `issue-945-transaction-scrollbar-interactions.spec.ts` | geometryRead, explicitWait |
| `issue-945-transaction-scrollbar-stability.spec.ts` | explicitWait |
| `keyboard-shortcut-router.spec.ts` | dataset |
| `layout-inspector.spec.ts` | getComputedStyle, geometryRead |
| `left-header-action-alignment.spec.ts` | querySelector, geometryRead |
| `left-tree-compact-footer.spec.ts` | geometryRead |
| `left-tree-critical-icons.spec.ts` | querySelector |
| `left-tree-interaction.spec.ts` | dataset |
| `left-tree-menu-contrast.spec.ts` | getComputedStyle |
| `left-tree-projection-policy-correction.spec.ts` | dataset |
| `left-tree-type-filter.spec.ts` | dataset |
| `listener-lifecycle.spec.ts` | dataset |
| `local-geometry-dom-batch.spec.ts` | querySelector, dataset |
| `measurement-anchor-drag.spec.ts` | explicitWait |
| `measurement-export-matrix.spec.ts` | dataset |
| `measurement-lane-stacking.spec.ts` | dataset |
| `minimal-cycle-view.spec.ts` | dataset, geometryRead |
| `minimap-overview-performance.spec.ts` | querySelector, dataset |
| `minimap-viewport-closure.spec.ts` | dataset, geometryRead |
| `mode-isolation-journey.spec.ts` | getComputedStyle, dataset, geometryRead |
| `open-progressive-wave-yield.spec.ts` | querySelector, dataset, explicitWait |
| `perf-755-far-jump-longtask.spec.ts` | querySelector |
| `perf-fixed-full-span-open.spec.ts` | querySelector, dataset |
| `performance-closure.spec.ts` | querySelector, dataset, geometryRead, explicitWait |
| `production-presentation-equivalence.spec.ts` | getComputedStyle, geometryRead |
| `qa-cross-mode-journey.spec.ts` | querySelector |
| `reorder-visibility.spec.ts` | dataset, geometryRead |
| `review-workflow.spec.ts` | getComputedStyle, geometryRead |
| `ribbon-caption-layout.spec.ts` | querySelector, getComputedStyle, geometryRead |
| `ribbon-cursor-ab.spec.ts` | getComputedStyle, geometryRead |
| `ribbon-layout.spec.ts` | geometryRead |
| `ribbon-more-popover-closure.spec.ts` | geometryRead |
| `runtime-owner-acceptance.spec.ts` | getComputedStyle |
| `signal-split.spec.ts` | getComputedStyle |
| `spacer-clipboard-reorder.spec.ts` | dataset |
| `splitter-view-state.contract.spec.ts` | getComputedStyle, explicitWait |
| `stable-id-collision.spec.ts` | querySelector |
| `stable-surface.spec.ts` | dataset |
| `timeline-editor.spec.ts` | dataset, geometryRead |
| `timeline-edits-stable-ids.spec.ts` | explicitWait |
| `timeline-range-100k.spec.ts` | querySelector, dataset, geometryRead |
| `timeline-range-edit-readability.spec.ts` | geometryRead |
| `timing-grid-x-scale-closure.spec.ts` | querySelector, dataset, geometryRead |
| `transaction-add-below-selected.spec.ts` | dataset |
| `transaction-bottom-draft.contract.spec.ts` | getComputedStyle |
| `transaction-bottom-panel-table.spec.ts` | geometryRead |
| `transaction-drag.spec.ts` | geometryRead, explicitWait |
| `transaction-lane-labels-visible.spec.ts` | getComputedStyle |
| `transaction-lane-scaling.spec.ts` | querySelector, dataset, geometryRead |
| `transaction-minimap-overview.spec.ts` | getComputedStyle |
| `transaction-phase-bars.spec.ts` | geometryRead |
| `transaction-ribbon-groups.spec.ts` | dataset |
| `transaction-selection.contract.spec.ts` | getComputedStyle |
| `transaction-startup-fixture-matrix.spec.ts` | querySelector |
| `transaction-startup-large-fixture.spec.ts` | querySelector, dataset |
| `transaction-startup-metrics.spec.ts` | dataset |
| `transaction-table-name-column-alignment.spec.ts` | querySelector, getComputedStyle, dataset, geometryRead |
| `transaction-tree-control-parity.spec.ts` | querySelector, geometryRead |
| `transaction-tree-group-new-transaction.spec.ts` | dataset |
| `transaction-tree-more-menu-visible.spec.ts` | elementContains, geometryRead |
| `transaction-viewport-hscroll.spec.ts` | geometryRead |
| `tree-drag-drop.spec.ts` | dataset |
| `undo-redo-selection-context.spec.ts` | querySelector, geometryRead |
| `unsaved-file-dialog.spec.ts` | getComputedStyle, elementContains, geometryRead, explicitWait |
| `v8-gui-contract-coverage.spec.ts` | geometryRead |
| `view-metrics-owner.spec.ts` | dataset, geometryRead |
| `view-mode-readability.spec.ts` | getComputedStyle |
| `view-ribbon-slot.spec.ts` | querySelector, getComputedStyle, dataset, geometryRead |
| `visual-grammar-cross-component.spec.ts` | querySelector, geometryRead |
| `wavedrom-shared-definitions.spec.ts` | querySelector, styleMutation, directDomMutation, explicitWait |
| `zoom-text-fidelity.spec.ts` | getComputedStyle, dataset, geometryRead, explicitWait |

## Exact-title duplicate candidates

No exact normalized cross-file title duplicates found.

## Similar-title candidates

Title similarity is only a discovery heuristic. It does not establish duplicate coverage; review the setup, assertions, and protected invariant before merging or moving tests.

- **0.78** — DISTINCT_CONTRACTS: `annotation-preview-update.spec.ts:72` “Apply commits the previewed draft as one real SemanticCommand” ↔ `clock-preview.spec.ts:81` “Apply after Preview commits exactly the previewed draft as one real SemanticCommand”
- **0.75** — DISTINCT_CONTRACTS: `annotation-preview-update.spec.ts:47` “Annotation Preview Update reverts even without an explicit Cancel, when selection moves away” ↔ `clock-preview.spec.ts:64` “Clock Preview reverts even without an explicit Cancel, when selection moves away”
- **0.73** — DISTINCT_CONTRACTS: `gui-bottom-resize.spec.ts:3` “Bottom Editor splitter resizes and collapses without changing document or render state” ↔ `gui-inspector-resize.spec.ts:3` “Inspector splitter resizes and collapses without changing document or render state”
- **0.7** — DISTINCT_CONTRACTS: `transaction-startup-fixture-matrix.spec.ts:8` “Transaction Open reaches first useful paint for medium fixture at 1280x720” ↔ `transaction-startup-large-fixture.spec.ts:5` “500-Transaction Open reaches first useful Transaction paint at 1280x720”
- **0.7** — DISTINCT_CONTRACTS: `transaction-startup-fixture-matrix.spec.ts:8` “Transaction Open reaches first useful paint for medium fixture at 1672x941” ↔ `transaction-startup-large-fixture.spec.ts:5` “500-Transaction Open reaches first useful Transaction paint at 1672x941”
- **0.7** — DISTINCT_CONTRACTS: `transaction-startup-fixture-matrix.spec.ts:8` “Transaction Open reaches first useful paint for small fixture at 1280x720” ↔ `transaction-startup-large-fixture.spec.ts:5` “500-Transaction Open reaches first useful Transaction paint at 1280x720”
- **0.7** — DISTINCT_CONTRACTS: `transaction-startup-fixture-matrix.spec.ts:8` “Transaction Open reaches first useful paint for small fixture at 1672x941” ↔ `transaction-startup-large-fixture.spec.ts:5` “500-Transaction Open reaches first useful Transaction paint at 1672x941”

## Consolidation/replacement map

- `mechanical-visual-diagnostics.spec.ts` “browser diagnostics detect injected clipping, overlap, duplication, and icon drift” → unit: `tests/harness/mechanical-diagnostics.test.ts` “emits stable findings for clipping, overlap, duplicate text, and icon alignment”. **Invariant:** The mechanical visual analyzer reports clipping, overlap, duplicate-text, and icon-alignment findings for supplied geometry evidence. **Reason:** The removed browser case creates only synthetic page content and calls the same pure analyzer; the Vitest replacement covers the same four negative categories without launching the production browser application.
- `full-gui.spec.ts` “matches the locked desktop pane geometry at the Golden viewport” → `gui-reference-v8.spec.ts` “matches the v8 shell contract without mutating canonical state”. **Invariant:** At the desktop reference viewport, ribbon/workspace/bottom/inspector geometry stays aligned to the approved shell dimensions. **Reason:** The v8 shell contract already measures the same reference viewport and was strengthened to assert workspace top, Bottom X/height, and Inspector X/width alongside shell geometry; the separate test only repeated those fixed coordinates.
- `full-gui.spec.ts` “keeps the V1 Home Ribbon dense without horizontal scrolling” → `gui-reference-v8.spec.ts` “matches the v8 shell contract without mutating canonical state”. **Invariant:** The desktop Home Ribbon retains its intended height/group structure and does not introduce horizontal scrolling. **Reason:** The target already verifies the desktop Ribbon height, non-overflow, major-group count, title/tabs/status dimensions, and group visibility in the same production presentation contract.
- `full-gui.spec.ts` “Left Signal/Group filter is positioned in the V1 pane header and remains DOM-only” → `left-tree-type-filter.spec.ts` “combines the Left Tree type and text filters without mutation at 1672px”. **Invariant:** Text filtering changes only Left Tree presentation, leaves Canonical/History untouched, and clearing the query restores rows while preserving type filter state. **Reason:** The retained type+text filter journey already verifies view-only state across both widths; it now uses the visible Clear signal tree filter control rather than only filling an empty string. Header placement remains checked by the v8 reference contract.
- `full-gui.spec.ts` “Group header chevron collapses derived rows without mutating Canonical or History” → `left-tree-interaction.spec.ts` “collapses only Left Tree descendants and restores stable rows without a canonical mutation”. **Invariant:** Group disclosure changes navigation descendants only, preserves frozen/timing/wave rows and stable order, and causes no document/history/render mutation. **Reason:** The retained test exercises all three groups and stable row restoration while checking derived surfaces and render counters; the removed test repeated the same projection lifecycle for one group and added icon-path implementation detail.
- `full-gui.spec.ts` “Inspector keeps the V1 sectioned editor geometry for a selected clock” → `gui-reference-v8.spec.ts` “matches the v8 shell contract without mutating canonical state”. **Invariant:** The reference Clock Inspector exposes its Clock Generator and Edge Counter controls within the established shell width without mutating the document. **Reason:** The v8 reference contract already opens with Clock selected and checks Inspector/minimap geometry, section headings, and no-mutation render state. The replacement now also requires the Clock period and Edge Counter mode controls to be visible; raw section count was implementation-specific.
- `qa-fresh-state-journeys.spec.ts` “J6 annotation create -> drag -> Escape leaves Canonical untouched” → `keyboard-shortcut-router.spec.ts` “Escape cancels an in-progress Annotation drag, closes the context menu, and resets dependency-arrow pick”. **Invariant:** Escape cancels a real Annotation drag without changing Canonical revision, History, or Dirty state and without runtime errors. **Reason:** The keyboard lifecycle test already creates an Annotation through production UI, resolves its stable ID, performs a real pointer drag, and asserts revision and History preservation; it now also checks Dirty and runtime errors. Keeping the stronger test removes a duplicate fresh journey without weakening the cancellation contract.
- `full-gui.spec.ts` “keeps view-only selection, tabs, zoom and panel state out of History and WaveDrom” → `performance-view-only-validation.spec.ts` “view-only GUI operations do not validate or semantically rerender the document”. **Invariant:** Composed view-only selection, tabs, zoom and panel operations do not mutate History or trigger semantic validation/rendering. **Reason:** The focused replacement exercises the same operations and additionally protects Dirty, validation, RowLayout, and pane resizer/scroll-owner counters.
- `golden-samples.spec.ts` “switches representative Golden Samples through production File Input without stale row ownership” → `golden-samples.spec.ts` “opens all 20 immutable Golden Samples in the production browser path”. **Invariant:** Sequential production File Input replacement leaves only current canonical row identities, without stale or duplicate rows. **Reason:** The all-20 production Open journey verifies exact canonical Left/Frozen row identity after each replacement, covering the representative A-to-B switch subset.
- `transaction-export.spec.ts` “preserves canonical Split View content through Save/Open” → `transaction-export.spec.ts` “creates, edits, links, saves and reopens one canonical Transaction at 1672x941”. **Invariant:** Canonical Transaction identity and timing survive production Save/Open with clean History after reopening. **Reason:** The replacement verifies more persisted Transaction fields, stable linked Signal identity, Undo/Redo and History reset; separate Combined projection cases retain mode coverage.
- `transaction-export.spec.ts` “Export dialog applies page and fit settings to the exported scene” → `transaction-export.spec.ts` “keeps long document layout metadata through page-fit SVG, PNG and PDF export”. **Invariant:** Production Export page size/orientation/fit/margin settings produce the expected page viewBox and page-content layer. **Reason:** The replacement preserves the page-content layer and exact A4 portrait/page-fit/margin assertion, then covers metadata, alternate orientation/fit, PNG and PDF.
- `signal-split.spec.ts` “Upper and Lower scroll vertically independently while sharing one horizontal time domain” → `acceptance-397-sample-d.spec.ts` “Signal Split ON shows the same 24-Signal row sequence in both panes with independent vertical scroll and shared horizontal scroll, OFF returns to one viewport, view-only throughout”. **Invariant:** Upper/Lower Vertical scrolling stays independent while both panes share the horizontal time mapping and view-only state. **Reason:** The Sample D replacement exercises real vertical overflow in both directions, shared horizontal scrolling and zoom, row parity, view-only invariants, and Split OFF using a representative 24-Signal production fixture; the default-fixture predecessor only scrolled Upper and checked ruler transforms.
- `ribbon-more-popover-closure.spec.ts` “does not create horizontal Ribbon overflow at 1024px” → `ribbon-responsive-overflow.spec.ts` “keeps Home commands reachable without a Ribbon scrollbar at 1024px”. **Invariant:** The Ribbon fits within the viewport at 1024px without horizontal scrolling, and compact Home commands remain reachable through More. **Reason:** The replacement covers the same no-overflow invariant and additionally verifies the compact More menu's command reachability in the same browser journey.
- `ribbon-more-popover-closure.spec.ts` “does not create horizontal Ribbon overflow at 1280px” → `ribbon-responsive-overflow.spec.ts` “keeps Home commands reachable without a Ribbon scrollbar at 1280px”. **Invariant:** The Ribbon fits within the viewport at 1280px without horizontal scrolling. **Reason:** The replacement checks the same no-overflow condition while also protecting the expected wide-layout major Ribbon groups.
- `issue-738-ruler-origin-after-scroll-return.spec.ts` “ruler returns to cycle 0 after scroll-away-and-return at zoom 50%” → `issue-738-ruler-origin-after-scroll-return.spec.ts` “ruler returns to cycle 0 after scroll-away-and-return across zoom levels”. **Invariant:** At each supported zoom level (50%, 200%, 800%), far right scroll and return keeps cycle zero as the leftmost ruler origin. **Reason:** The same 5,000-cycle fixture and interaction were previously booted once per zoom. One page now exercises all three zoom levels sequentially while retaining each zoom's three far-scroll return assertions.
- `issue-738-ruler-origin-after-scroll-return.spec.ts` “ruler returns to cycle 0 after scroll-away-and-return at zoom 200%” → `issue-738-ruler-origin-after-scroll-return.spec.ts` “ruler returns to cycle 0 after scroll-away-and-return across zoom levels”. **Invariant:** At each supported zoom level (50%, 200%, 800%), far right scroll and return keeps cycle zero as the leftmost ruler origin. **Reason:** Consolidated into the single-session multi-zoom ruler-origin contract; individual zoom iterations and scroll anchors remain explicit.
- `issue-738-ruler-origin-after-scroll-return.spec.ts` “ruler returns to cycle 0 after scroll-away-and-return at zoom 800%” → `issue-738-ruler-origin-after-scroll-return.spec.ts` “ruler returns to cycle 0 after scroll-away-and-return across zoom levels”. **Invariant:** At each supported zoom level (50%, 200%, 800%), far right scroll and return keeps cycle zero as the leftmost ruler origin. **Reason:** Consolidated into the single-session multi-zoom ruler-origin contract; individual zoom iterations and scroll anchors remain explicit.
- `issue-629-combined-tree-inspector.spec.ts` “Combined: selecting a Transaction in the Tree after a Signal switches the Inspector to Transaction” → `inspector-selection-context.contract.spec.ts` “Combined: selecting a Transaction in the Tree after a Signal switches the Inspector to Transaction”. **Invariant:** Combined Inspector follows stable selected entity kind from a Signal to a Transaction without History mutation. **Reason:** Moved the Issue-specific check into the stable Inspector selection/context contract suite while preserving its individual production journey and #629 traceability.
- `issue-629-inspector-mode-context.spec.ts` “Inspector follows active workspace context and retains hidden stable selection at 1280x720” → `inspector-selection-context.contract.spec.ts` “Inspector follows active workspace context and retains hidden stable selection at 1280x720”. **Invariant:** Inspector follows active workspace and restores hidden Transaction/Signal selection by stable identity through Cycle/Transaction/Combined without document/history changes. **Reason:** Moved the compact cross-mode user journey into the stable Inspector selection/context contract suite; test behavior is unchanged and #629 origin metadata is retained.
- `issue-701-layout-return.spec.ts` “Layout Inspector is reachable again after clearing the Transaction selection” → `inspector-selection-context.contract.spec.ts` “Layout Inspector is reachable again after clearing the Transaction selection”. **Invariant:** Clearing selected Transaction restores Layout Inspector; reselecting returns to entity properties without changing History. **Reason:** Moved the distinct selection-clear lifecycle into the stable Inspector selection/context suite with #701 traceability.
- `issue-737-selection-gestures.spec.ts` “Bottom grid selection gestures at 1672x941” → `transaction-selection.contract.spec.ts` “Bottom grid selection gestures at 1280x720”. **Invariant:** Click/Ctrl/Shift selection, visible-order filtering, Ctrl+A scoping, and view-only Canonical/History behavior are viewport-independent. **Reason:** Removed the duplicate desktop execution; the compact viewport retains the full semantic journey, while issue-747-geometry-acceptance.spec.ts continues to verify responsive geometry at both 1280x720 and 1672x941.
- `issue-747-a11y-and-sort-matrix.spec.ts` “Bottom sort matrix and settings a11y at 1672x941” → `issue-747-a11y-and-sort-matrix.spec.ts` “Bottom sort matrix and settings a11y at 1280x720”. **Invariant:** Start/End sort direction, selected-ID retention, view-only sort, named settings gear, and Escape popover close are width-independent semantic behavior. **Reason:** Removed the redundant desktop semantic run. The compact case retains the complete a11y/sort journey, and issue-747-geometry-acceptance.spec.ts still verifies the layout-specific behavior at both supported viewports.
- `issue-625-timeline-only-hscroll.spec.ts` “Cycle FixedColumns sit outside the horizontal scroll owner at 1280x720” → `issue-625-cycle-fixed-columns-scroll.spec.ts` “Cycle fixed columns stay stationary through native scrollbar drag at 1280x720”. **Invariant:** Timeline-only horizontal scrolling keeps fixed columns stationary and the visible scrollbar aligned to the time-domain region. **Reason:** Removed the implementation-coupled browser case that forced --wave-width, asserted overflow/DOM ancestry, and re-derived scroll-owner topology. The production-path native-scroll journey now also measures visible scrollbar alignment at this width; check:cycle-scroll-owner protects the structural owner contract without launching a browser.
- `issue-625-timeline-only-hscroll.spec.ts` “Cycle FixedColumns sit outside the horizontal scroll owner at 1672x941” → `issue-625-cycle-fixed-columns-scroll.spec.ts` “Cycle fixed columns stay stationary through native scrollbar drag at 1672x941”. **Invariant:** Timeline-only horizontal scrolling keeps fixed columns stationary and the visible scrollbar aligned to the time-domain region. **Reason:** Removed the implementation-coupled browser case that forced --wave-width, asserted overflow/DOM ancestry, and re-derived scroll-owner topology. The production-path native-scroll journey now also measures visible scrollbar alignment at this width; check:cycle-scroll-owner protects the structural owner contract without launching a browser.
- `issue-755-analytic-geometry-equivalence.spec.ts` “analytic cycle grid equals SVG-derived boundaries (unwindowed document)” → `issue-755-analytic-transition-equivalence.spec.ts` “analytic Local Geometry equals the SVG extractor for every anchor across token/brick cases”. **Invariant:** Analytic geometry agrees with an independent SVG DOM extraction for cycle boundaries and all anchor kinds. **Reason:** The removed assertion compared the production geometry to a duplicated 20.5 + 40 * index formula rather than to SVG-derived geometry. The replacement probe directly compares analytic LocalGeometry against the independent production SVG extractor across token/brick cases, while uniformCycleGeometry.test.ts retains cheap known-anchor/property coverage.
- `issue-755-analytic-geometry-equivalence.spec.ts` “analytic cycle grid equals SVG-derived boundaries (bounded window on a >4096-cycle document)” → `issue-755-analytic-transition-equivalence.spec.ts` “analytic Local Geometry equals the SVG extractor for every anchor across token/brick cases”. **Invariant:** Rebased/windowed analytic cycle geometry preserves source-cycle identity and boundary X, without a local-index identity assumption. **Reason:** The equivalence probe includes rebased-window cases and compares each semantic anchor with SVG extraction; issue-757-far-scroll-window-coverage.spec.ts separately proves a real >4096-cycle far jump paints the viewport. The previous check reconstructed a uniform pitch in browser code, adding a second copy of production geometry math.
- `issue-750-geometry-10-to-50.spec.ts` “1 TC = 10 cycles -> 50 cycles compresses bars 5x, keeps TC label pitch, never changes canonical cycles (1672x941)” → `issue-750-geometry-10-to-50.spec.ts` “1 TC = 10 cycles -> 50 cycles compresses bars 5x, keeps TC label pitch, never changes canonical cycles (1280x720)”. **Invariant:** Changing cycles-per-TC compresses a fixed source span by the inverse ratio, preserves displayed TC ruler pitch, leaves canonical source duration unchanged, and Undo restores the prior display. **Reason:** The geometry ratio and source-time semantics are viewport-independent. The compact test retains the complete Journey, while both viewports remain covered by the distinct clipped-label and scroll-extent acceptance where width is relevant.
- `issue-629-inspector-mode-context.spec.ts` “Inspector follows active workspace context and retains hidden stable selection at 1672x941” → `inspector-selection-context.contract.spec.ts` “Inspector follows active workspace context and retains hidden stable selection at 1280x720”. **Invariant:** Inspector content follows the active mode and restores hidden selected entities by stable identity without Canonical, History or Dirty changes. **Reason:** The cross-mode owner/identity journey has no width-dependent layout assertion. The compact viewport retains all mode transitions and state invariants; responsive Inspector geometry is covered by separate layout acceptance.
- `issue-630-active-mode-title.spec.ts` “document title never displays a stale mode suffix at 1672x941” → `issue-630-active-mode-title.spec.ts` “document title never displays a stale mode suffix at 1280x720”. **Invariant:** The displayed mode title tracks Cycle/Transaction/Combined, remains separate from the document name, and stays correct through document replacement and reload. **Reason:** Title/mode ownership and reload behavior are width-independent. One compact viewport retains the entire Journey; width-dependent titlebar overflow belongs in the responsive layout suite.
- `issue-725-f2-edit.spec.ts` “F2 on the active Bottom row starts editing without committing” → `issue-725-keyboard-journey.spec.ts` “Bottom grid keyboard editing journey at 1280x720”. **Invariant:** F2 from the focused active Transaction row enters the Bottom row editor without adding a History unit. **Reason:** The retained compact keyboard journey performs the same real F2 activation and asserts the name field receives focus with Canonical revision and History unchanged, then additionally verifies visible-column Tab order and Escape draft cancellation. The standalone F2 smoke duplicated a strict subset of that journey.
- `issue-763-retained-phase-drafts.spec.ts` “retained Phase drafts are explicit at 1672x941” → `issue-763-retained-phase-drafts.spec.ts` “retained Phase drafts are explicit at 1280x720”. **Invariant:** A Phase draft survives changing the selected Transaction, is marked as retained in both editors, and can be explicitly discarded without changing Canonical or History. **Reason:** This is a width-independent stable-ID/draft-lifecycle contract with no layout or clipping assertion. The compact viewport retains the complete user journey; responsive editor geometry is covered by dedicated layout acceptance.
- `issue-767-zoom-keeps-glyph-shape.spec.ts` “zoom does not stretch Transaction text at 1672x941” → `issue-767-zoom-keeps-glyph-shape.spec.ts` “zoom does not stretch Transaction text at 1280x720”. **Invariant:** Transaction and Phase glyphs retain their natural rendered font size/height during zoom while the track, ruler, and Transaction edges remain geometrically aligned. **Reason:** The semantic text-size invariant is width-independent; retain one compact viewport. Width-dependent clipping/overflow is covered by dedicated layout tests. Replaced a computed-style transform scan with the observable rendered text dimensions and ruler alignment.
- `issue-760-combined-horizontal-wheel.spec.ts` “Combined horizontal wheel scrolls the shared viewport at 1672x941” → `issue-760-combined-horizontal-wheel.spec.ts` “Combined horizontal wheel scrolls the shared viewport at 1280x720”. **Invariant:** Wheel over either pane in a fresh Combined workspace advances the shared horizontal time viewport without changing Canonical, History, or Dirty state. **Reason:** The semantic wheel-owner contract is width-independent and the compact viewport retains wheel interaction over both pane regions. The issue's shared horizontal geometry is separately verified at both accepted viewport sizes by geometry/scroll acceptance tests.
- `issue-740-cycle-bottom-hidden-geometry.spec.ts` “Cycle releases Bottom space when hidden at 1672x941” → `issue-740-cycle-bottom-hidden.spec.ts` “Cycle releases Bottom space when hidden at both supported viewports”. **Invariant:** Hiding Cycle Bottom releases the lower workspace space; the state survives a mode round-trip and can be restored without document mutation. **Reason:** The duplicate case asserted the same hide/round-trip/show geometry while additionally reading CSS grid row values. The retained user-visible test checks the actual workspace gap and hidden Bottom, plus History, Dirty, and Canonical revision invariants.
- `issue-740-cycle-bottom-hidden-geometry.spec.ts` “Cycle releases Bottom space when hidden at 1280x720” → `issue-740-cycle-bottom-hidden.spec.ts` “Cycle releases Bottom space when hidden at both supported viewports”. **Invariant:** Hiding Cycle Bottom releases the lower workspace space; the state survives a mode round-trip and can be restored without document mutation. **Reason:** The compact viewport's user-visible gap and hidden-state journey remain covered in the retained test; the removed assertion was coupled to CSS grid-template-row implementation details.
- `issue-740-741-756-cycle-layout.spec.ts` “#740 Cycle: hiding Bottom returns every Bottom/splitter row to the timing canvas at 1672x941” → `issue-740-cycle-bottom-hidden.spec.ts` “Cycle releases Bottom space when hidden at both supported viewports”. **Invariant:** Hiding Cycle Bottom removes the reserved space and is view-only. **Reason:** The removed case repeated the hide state, panel-to-workspace edge and hidden resizer assertions; the retained #740 journey covers those with stronger Dirty/revision checks, while #756 coverage remains in the same spec.
- `issue-740-741-756-cycle-layout.spec.ts` “#740 Cycle: hiding Bottom returns every Bottom/splitter row to the timing canvas at 1280x720” → `issue-740-cycle-bottom-hidden.spec.ts` “Cycle releases Bottom space when hidden at both supported viewports”. **Invariant:** Hiding Cycle Bottom removes the reserved space and is view-only. **Reason:** The compact case was a duplicate of the retained #740 contract; the shared file continues to exercise #741 and #756 independently.
- `issue-766-cycle-plural.spec.ts` “Time Scale readout uses singular/plural correctly at 1672x941” → `issue-766-cycle-plural.spec.ts` “Time Scale readout uses singular/plural correctly”. **Invariant:** TC singular/plural copy is correct for values 1, 10 and 50. **Reason:** Copy is viewport-independent; the retained compact case checks the same three supported values and no singular 'cycles' regression.
- `issue-741-transaction-no-left-resizer.spec.ts` “Transaction mode exposes no keyboard-operable left-pane separator” → `issue-740-741-756-cycle-layout.spec.ts` “#741 Transaction fixed-width sidebar exposes no focusable ghost resizer and hides no width mutation”. **Invariant:** Transaction has no focusable ghost resizer, while Cycle retains a functional keyboard-operable separator. **Reason:** The retained #741 case now checks both the Transaction absence and a Cycle ArrowRight change to aria-valuenow; the standalone test duplicated the absence assertion and only added the latter half.
- `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact in Cycle at 1672x941” → `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact across Cycle, Transaction and Combined at 1672x941”. **Invariant:** Every Ribbon tab's labels remain readable and every control stays within the Ribbon in Cycle, Transaction and Combined at each tested responsive width. **Reason:** The retained per-viewport test traverses all three modes and every tab in one loaded app, preserving the full combination while removing repeated app setup.
- `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact in Transaction at 1672x941” → `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact across Cycle, Transaction and Combined at 1672x941”. **Invariant:** Every Ribbon tab's labels remain readable and every control stays within the Ribbon in Cycle, Transaction and Combined at each tested responsive width. **Reason:** The retained per-viewport test traverses all three modes and every tab in one loaded app, preserving the full combination while removing repeated app setup.
- `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact in Combined at 1672x941” → `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact across Cycle, Transaction and Combined at 1672x941”. **Invariant:** Every Ribbon tab's labels remain readable and every control stays within the Ribbon in Cycle, Transaction and Combined at each tested responsive width. **Reason:** The retained per-viewport test traverses all three modes and every tab in one loaded app, preserving the full combination while removing repeated app setup.
- `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact in Cycle at 1280x720” → `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact across Cycle, Transaction and Combined at 1280x720”. **Invariant:** Every Ribbon tab's labels remain readable and every control stays within the Ribbon in Cycle, Transaction and Combined at each tested responsive width. **Reason:** The retained per-viewport test traverses all three modes and every tab in one loaded app, preserving the full combination while removing repeated app setup.
- `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact in Transaction at 1280x720” → `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact across Cycle, Transaction and Combined at 1280x720”. **Invariant:** Every Ribbon tab's labels remain readable and every control stays within the Ribbon in Cycle, Transaction and Combined at each tested responsive width. **Reason:** The retained per-viewport test traverses all three modes and every tab in one loaded app, preserving the full combination while removing repeated app setup.
- `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact in Combined at 1280x720” → `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact across Cycle, Transaction and Combined at 1280x720”. **Invariant:** Every Ribbon tab's labels remain readable and every control stays within the Ribbon in Cycle, Transaction and Combined at each tested responsive width. **Reason:** The retained per-viewport test traverses all three modes and every tab in one loaded app, preserving the full combination while removing repeated app setup.
- `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact in Cycle at 1024x700” → `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact across Cycle, Transaction and Combined at 1024x700”. **Invariant:** Every Ribbon tab's labels remain readable and every control stays within the Ribbon in Cycle, Transaction and Combined at each tested responsive width. **Reason:** The retained per-viewport test traverses all three modes and every tab in one loaded app, preserving the full combination while removing repeated app setup.
- `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact in Transaction at 1024x700” → `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact across Cycle, Transaction and Combined at 1024x700”. **Invariant:** Every Ribbon tab's labels remain readable and every control stays within the Ribbon in Cycle, Transaction and Combined at each tested responsive width. **Reason:** The retained per-viewport test traverses all three modes and every tab in one loaded app, preserving the full combination while removing repeated app setup.
- `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact in Combined at 1024x700” → `issue-441-ribbon-label-integrity.spec.ts` “Ribbon labels are intact across Cycle, Transaction and Combined at 1024x700”. **Invariant:** Every Ribbon tab's labels remain readable and every control stays within the Ribbon in Cycle, Transaction and Combined at each tested responsive width. **Reason:** The retained per-viewport test traverses all three modes and every tab in one loaded app, preserving the full combination while removing repeated app setup.
- `issue-722-splitter-discoverability.spec.ts` “Bottom and Inspector splitters are discoverable at 1280x720” → `splitter-view-state.contract.spec.ts` “Bottom and Inspector splitters are discoverable at 1280x720”. **Invariant:** Both splitter orientations remain discoverable and keyboard-operable across responsive layouts without changing Canonical, History or Dirty state. **Reason:** Moved the unchanged production journey into a stable splitter view-state contract suite; case-level viewport metadata and #722 traceability are retained.
- `issue-722-splitter-discoverability.spec.ts` “Bottom and Inspector splitters are discoverable at 1672x941” → `splitter-view-state.contract.spec.ts` “Bottom and Inspector splitters are discoverable at 1672x941”. **Invariant:** Both splitter orientations remain discoverable and keyboard-operable across responsive layouts without changing Canonical, History or Dirty state. **Reason:** Moved the unchanged production journey into a stable splitter view-state contract suite; case-level viewport metadata and #722 traceability are retained.
- `issue-722-splitter-reset.spec.ts` “double-clicking the Bottom and Inspector splitters restores default sizes without touching the document” → `splitter-view-state.contract.spec.ts` “double-clicking the Bottom and Inspector splitters restores default sizes without touching the document”. **Invariant:** Double-clicking either splitter restores the documented default view size without changing History or Dirty state. **Reason:** Moved the distinct fast reset journey into the stable splitter suite while retaining its PR profile and #722 traceability.
- `issue-723-status-diagnostics.spec.ts` “developer diagnostics are collapsed by default and revealed deliberately” → `issue-723-status-diagnostics.spec.ts` “status diagnostics stay opt-in and the left rail never covers status in compact modes”. **Invariant:** Diagnostics remain opt-in without document mutation and the left workspace rail remains above the status bar at 1280x720 through Cycle, Transaction and Combined. **Reason:** Combines two assertions into one loaded production journey, removing a duplicate app startup while preserving both independent visible contracts.
- `issue-723-status-diagnostics.spec.ts` “left rail never covers the status bar at 1280x720” → `issue-723-status-diagnostics.spec.ts` “status diagnostics stay opt-in and the left rail never covers status in compact modes”. **Invariant:** The left workspace rail never covers the status bar in compact layout across all view modes. **Reason:** The cross-mode geometry assertions now share the same 1280x720 page lifecycle as the opt-in diagnostics check; no assertion was removed.
- `issue-725-draft-markers.spec.ts` “edited Bottom row cells show a draft marker and double-click focuses the editor” → `transaction-bottom-draft.contract.spec.ts` “Bottom draft edit is visibly marked and Escape restores the committed value without deselecting”. **Invariant:** Double-click focuses the field; changed draft styling and marker appear; Escape restores committed appearance/value without a History mutation. **Reason:** Combined with the focused Escape cancellation journey so both visual feedback and draft lifecycle assertions run in one production fixture load.
- `issue-725-escape-revert.spec.ts` “Escape in the active Bottom row reverts a dirty draft before deselecting” → `transaction-bottom-draft.contract.spec.ts` “Bottom draft edit is visibly marked and Escape restores the committed value without deselecting”. **Invariant:** Escape resets the active Bottom draft to its canonical value while retaining selection and History unchanged. **Reason:** The source assertion is retained in the merged journey, which additionally proves the dirty indicator clears and selection remains stable.
- `issue-737-bottom-sort.spec.ts` “Bottom Transaction table sorts by Start as view state only” → `issue-747-a11y-and-sort-matrix.spec.ts` “Bottom sort matrix and settings a11y at 1280x720”. **Invariant:** Start sort asc/desc and return-to-document-order preserve exact stable-ID row sequences; sorting changes only view state. **Reason:** The #747 matrix now asserts explicit hand-authored stable-ID orders for Start/End, preserves the selected ID, returns to original document order, and retains Canonical/History checks. Removed duplicate separate app startup.
- `issue-737-multi-select.spec.ts` “Bottom Transaction table uses click/Ctrl/Shift selection without checkboxes or history changes” → `transaction-selection.contract.spec.ts` “Bottom Transaction table uses click/Ctrl/Shift selection without checkboxes or history changes”. **Invariant:** Click/Ctrl/Shift/Ctrl+A selection, checkbox absence, multi-duplicate as one History unit, and one-step Undo remain covered. **Reason:** Moved the unchanged bulk mutation journey into the stable Transaction selection contract suite while preserving its own test case and metadata.
- `issue-737-selection-gestures.spec.ts` “Bottom grid selection gestures at 1280x720” → `transaction-selection.contract.spec.ts` “Bottom grid selection gestures at 1280x720”. **Invariant:** Visible-order selection ranges under filtering, input-scoped Ctrl+A, and view-only state remain covered at 1280x720. **Reason:** Moved the unchanged compact production journey into the stable Transaction selection contract suite; two-viewport geometry acceptance remains separate.
- `issue-737-selection-gestures.spec.ts` “Bottom grid exposes aria-selected and aria-expanded with named disclosure controls” → `transaction-selection.contract.spec.ts` “Bottom grid exposes aria-selected and aria-expanded with named disclosure controls”. **Invariant:** Selected state is exposed semantically and beyond color alone; expandable phase rows use named controls with aria-expanded state. **Reason:** Moved the unchanged accessibility journey into the stable Transaction selection contract suite while preserving its distinct invariant and traceability.
- `issue-738-ruler-hit-area.spec.ts` “ruler cell is the hit target, in Cycle at 1280x720” → `issue-738-ruler-hit-area.spec.ts` “ruler cell hit targets and bidirectional range gestures in Cycle at both supported viewports”. **Invariant:** Cycle ruler hit targets and both drag directions remain covered at the compact viewport. **Reason:** Compact assertions now run in the Cycle-mode viewport loop within one app session, alongside the desktop counterpart.
- `issue-738-ruler-hit-area.spec.ts` “ruler cell is the hit target, in Cycle at 1672x941” → `issue-738-ruler-hit-area.spec.ts` “ruler cell hit targets and bidirectional range gestures in Cycle at both supported viewports”. **Invariant:** Cycle ruler hit targets and both drag directions remain covered at the desktop viewport. **Reason:** Desktop assertions remain intact in the same Cycle-mode journey after viewport reflow, avoiding another app startup.
- `issue-738-ruler-hit-area.spec.ts` “ruler cell is the hit target, in Transaction at 1280x720” → `issue-738-ruler-hit-area.spec.ts` “ruler cell hit targets and bidirectional range gestures in Transaction at both supported viewports”. **Invariant:** Compressed Transaction ruler hit targets and both drag directions remain covered at the compact viewport. **Reason:** Compact assertions now run in the Transaction-mode viewport loop within one app session, alongside the desktop counterpart.
- `issue-738-ruler-hit-area.spec.ts` “ruler cell is the hit target, in Transaction at 1672x941” → `issue-738-ruler-hit-area.spec.ts` “ruler cell hit targets and bidirectional range gestures in Transaction at both supported viewports”. **Invariant:** Compressed Transaction ruler hit targets and both drag directions remain covered at the desktop viewport. **Reason:** Desktop assertions remain intact in the same Transaction-mode journey after viewport reflow, avoiding another app startup.
- `issue-740-741-756-cycle-layout.spec.ts` “#756 Cycle left rail spans Main + Bottom as one column (tree viewport reaches the workspace bottom) at 1280x720” → `issue-740-741-756-cycle-layout.spec.ts` “#756 Cycle left rail spans Main + Bottom at both supported viewports”. **Invariant:** The left rail reaches the workspace bottom and the timeline scrollbar remains above the Bottom splitter at compact viewport size. **Reason:** Runs both desktop and compact geometry assertions in one loaded Cycle workspace while restoring Bottom visibility between viewport sizes.
- `issue-740-741-756-cycle-layout.spec.ts` “#756 Cycle left rail spans Main + Bottom as one column (tree viewport reaches the workspace bottom) at 1672x941” → `issue-740-741-756-cycle-layout.spec.ts` “#756 Cycle left rail spans Main + Bottom at both supported viewports”. **Invariant:** The left rail reaches the workspace bottom and the timeline scrollbar remains above the Bottom splitter at desktop viewport size. **Reason:** Runs both desktop and compact geometry assertions in one loaded Cycle workspace while restoring Bottom visibility between viewport sizes.
- `issue-746-visible-group-create.spec.ts` “Tree and Bottom expose visible Group creation at 1280x720” → `issue-746-visible-group-create.spec.ts` “Tree and Bottom expose visible Group creation at both supported viewports”. **Invariant:** The Tree header and Bottom each create a visible Group and Undo restores the original collection at compact width. **Reason:** Runs the existing two-size Tree/Bottom create-and-Undo journey in one workspace while retaining width-specific visible bounds and header-overflow assertions.
- `issue-746-visible-group-create.spec.ts` “Tree and Bottom expose visible Group creation at 1672x941” → `issue-746-visible-group-create.spec.ts` “Tree and Bottom expose visible Group creation at both supported viewports”. **Invariant:** The Tree header and Bottom each create a visible Group and Undo restores the original collection at desktop width. **Reason:** Runs the existing two-size Tree/Bottom create-and-Undo journey in one workspace while retaining width-specific visible bounds and header-overflow assertions.
- `issue-748-add-and-focus-journey.spec.ts` “left-pane Add and keyboard journey at 1280x720” → `issue-748-add-and-focus-journey.spec.ts` “left-pane Add and keyboard journey at both supported viewports”. **Invariant:** Left-pane Add creates one stable Transaction with one History step, More does not reflow, and keyboard navigation skips Signals at compact width. **Reason:** Runs the repeated add/focus assertions at both viewport widths in one loaded Transaction workspace, recalculating the baseline stable IDs and History depth per size.
- `issue-748-add-and-focus-journey.spec.ts` “left-pane Add and keyboard journey at 1672x941” → `issue-748-add-and-focus-journey.spec.ts` “left-pane Add and keyboard journey at both supported viewports”. **Invariant:** Left-pane Add creates one stable Transaction with one History step, More does not reflow, and keyboard navigation skips Signals at desktop width. **Reason:** Runs the repeated add/focus assertions at both viewport widths in one loaded Transaction workspace, recalculating the baseline stable IDs and History depth per size.
- `issue-748-tree-menu-and-parity.spec.ts` “Transaction Tree menu behaviour and Cycle parity at 1280x720” → `issue-748-tree-menu-and-parity.spec.ts` “Transaction Tree menu behaviour and Cycle parity at both supported viewports”. **Invariant:** Cycle/Transaction header geometry parity, menu focus/keyboard behavior, view-only disclosure and semantic visibility commands work at compact width. **Reason:** Runs the existing geometry and menu state journey at both viewport sizes within one app session; each iteration takes fresh canonical, History and row-count baselines.
- `issue-748-tree-menu-and-parity.spec.ts` “Transaction Tree menu behaviour and Cycle parity at 1672x941” → `issue-748-tree-menu-and-parity.spec.ts` “Transaction Tree menu behaviour and Cycle parity at both supported viewports”. **Invariant:** Cycle/Transaction header geometry parity, menu focus/keyboard behavior, view-only disclosure and semantic visibility commands work at desktop width. **Reason:** Runs the existing geometry and menu state journey at both viewport sizes within one app session; each iteration takes fresh canonical, History and row-count baselines.
- `issue-740-cycle-bottom-hidden.spec.ts` “Cycle releases Bottom space when hidden at 1280x720” → `issue-740-cycle-bottom-hidden.spec.ts` “Cycle releases Bottom space when hidden at both supported viewports”. **Invariant:** Hiding Bottom releases Cycle space and mode round-trip does not alter document/history/dirty at compact viewport. **Reason:** Runs both sizes in one workspace and restores Bottom to its visible state after each pass, preserving independent responsive geometry and state-baseline checks.
- `issue-740-cycle-bottom-hidden.spec.ts` “Cycle releases Bottom space when hidden at 1672x941” → `issue-740-cycle-bottom-hidden.spec.ts` “Cycle releases Bottom space when hidden at both supported viewports”. **Invariant:** Hiding Bottom releases Cycle space and mode round-trip does not alter document/history/dirty at desktop viewport. **Reason:** Runs both sizes in one workspace and restores Bottom to its visible state after each pass, preserving independent responsive geometry and state-baseline checks.
- `issue-750-geometry-10-to-50.spec.ts` “compressed Transaction: no clipped labels and no artificial scroll extent at 1280x720” → `issue-750-geometry-10-to-50.spec.ts` “compressed Transaction has no clipped labels or artificial scroll extent at both supported viewports”. **Invariant:** Compressed Transaction names remain accessible and no artificial horizontal scroll extent appears at compact width. **Reason:** The unchanged clipping/extent assertions run at both widths after one transaction-demo load with the same 50-cycle display scale.
- `issue-750-geometry-10-to-50.spec.ts` “compressed Transaction: no clipped labels and no artificial scroll extent at 1672x941” → `issue-750-geometry-10-to-50.spec.ts` “compressed Transaction has no clipped labels or artificial scroll extent at both supported viewports”. **Invariant:** Compressed Transaction names remain accessible and no artificial horizontal scroll extent appears at desktop width. **Reason:** The unchanged clipping/extent assertions run at both widths after one transaction-demo load with the same 50-cycle display scale.
- `issue-751-bottom-phase-editor.spec.ts` “Bottom Phases tab shows parent context, top Apply/Revert and live validation” → `issue-751-bottom-phase-editor.spec.ts` “Bottom Phase editor preserves draft/validation and stable Phase identity through Start-order projection”. **Invariant:** Phase parent context, Apply/Revert placement, draft retention/reversion, live validation, and unchanged History remain protected. **Reason:** The Phase editor lifecycle and stable-identity/order checks use the same transaction-demo fixture and tab. Running them sequentially after Revert preserves both journeys while avoiding a duplicate application startup.
- `issue-751-bottom-phase-editor.spec.ts` “Phase rows follow Start-time order; edit and delete resolve the Phase, not the display index; validation wording is TC-safe” → `issue-751-bottom-phase-editor.spec.ts` “Bottom Phase editor preserves draft/validation and stable Phase identity through Start-order projection”. **Invariant:** Start-time projection order remains separate from stable Phase identity, delete resolves by Phase ID, and shared TC-safe validation does not mutate History. **Reason:** Both complementary Phase user journeys now run in one app session; the initial draft is reverted before the identity/order assertions, retaining each original check.
- `issue-747-geometry-acceptance.spec.ts` “Bottom table geometry is stable under settings, selection, sort and Phase expansion at 1280x720” → `issue-747-geometry-acceptance.spec.ts` “Bottom table geometry is stable under settings, selection, sort and Phase expansion at both viewports”. **Invariant:** Compact-width Bottom table/header/Phase geometry remains aligned through settings, selection, sort and expansion without document/history changes. **Reason:** Runs the existing responsive geometry journey at compact width after a single transaction-demo startup; all per-viewport geometry and state baselines are retained.
- `issue-747-geometry-acceptance.spec.ts` “Bottom table geometry is stable under settings, selection, sort and Phase expansion at 1672x941” → `issue-747-geometry-acceptance.spec.ts` “Bottom table geometry is stable under settings, selection, sort and Phase expansion at both viewports”. **Invariant:** Desktop Bottom table/header/Phase geometry remains aligned through settings, selection, sort and expansion without document/history changes. **Reason:** Runs the existing responsive geometry journey at desktop width in the same application session; the viewport is resized and geometry re-measured independently.
- `issue-761-start-input-width.spec.ts` “Start (cycle) input is readable at 1280x720” → `issue-761-start-input-width.spec.ts` “Start (cycle) input is readable at both supported viewports”. **Invariant:** The multi-digit Cycle Start draft fits within the compact Signal transition row without clipping or pushing neighboring controls outside. **Reason:** Measures the same draft at compact width after resizing the existing Cycle workspace rather than launching a second app session.
- `issue-761-start-input-width.spec.ts` “Start (cycle) input is readable at 1672x941” → `issue-761-start-input-width.spec.ts` “Start (cycle) input is readable at both supported viewports”. **Invariant:** The multi-digit Cycle Start draft remains readable at desktop width while keeping Value and Comment controls within the transition row. **Reason:** Measures desktop flex allocation in the same workspace and with the same draft used by the compact-width assertion.

Per-case titles, source lines, project, timeout, tags, annotations, and classification fields are in [`qa/test-suite-inventory.json`](../qa/test-suite-inventory.json). Curated classifications are maintained in [`qa/test-suite-review.json`](../qa/test-suite-review.json) so regeneration does not erase review work.

Regenerate with `npm run test:inventory` after installing workspace dependencies.
