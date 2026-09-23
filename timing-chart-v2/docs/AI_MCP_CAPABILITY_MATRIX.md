# AI / MCP Capability Matrix

Status is measured against the local Agent Bridge tool catalog in `scripts/ai-bridge-server.mjs`. “Implemented” means a named tool reaches a current view owner or SemanticCommand proposal builder; it does not imply that real-client/browser acceptance has passed. Document edits remain Preview → Validate → user Apply.

## User capabilities

| Capability | MCP tool | Canonical/View owner | View-only or Document edit | Requires approval | Stable-ID inputs | Time unit | Unit test | E2E | Status |
|---|---|---|---|---|---|---|---|---|---|
| Signal read | `get_signals`, `get_signal` | Canonical Signal | Read-only | No | `signalId`, `groupId` | n/a | `ai-bridge-session.test.ts` | `ai-bridge.spec.ts` | Implemented |
| Signal create / rename / update / move | `propose_create_signal`, `propose_rename_signal`, `propose_update_signal`, `propose_move_signal` | Signal SemanticCommand | Document edit | Yes | `signalId`, `groupId`, `targetGroupId` | n/a | `ai-proposal-provider.test.ts` | `ai-bridge.spec.ts` authored; not run | Implemented |
| Signal Group read / create / rename / move / delete | `get_signal_groups`, `propose_create_signal_group`, `propose_rename_signal_group`, `propose_move_signal_group`, `propose_delete_signal_group` | Group SemanticCommand | Read-only / Document edit | Edit: Yes | `groupId`; deletion only for empty groups | n/a | `ai-proposal-provider.test.ts` | `ai-bridge.spec.ts` authored; Codex in-app MCP acceptance completed | Implemented; automated E2E pending |
| Transaction read | `get_transactions`, `get_transaction`, `get_transaction_groups`, `get_transaction_phases`, `get_linked_signals` | Canonical Transaction | Read-only | No | `transactionId`, `groupId` | Canonical source cycles | `ai-bridge-session.test.ts` | `ai-bridge.spec.ts` | Implemented |
| Transaction create / update / move / resize / delete | `propose_create_transaction`, `propose_update_transaction`, `propose_move_transaction`, `propose_resize_transaction`, `propose_delete_transaction` | Transaction SemanticCommand | Document edit | Yes | `transactionId`, `groupId` | Canonical source cycles | `ai-proposal-provider.test.ts` | `ai-bridge.spec.ts` authored; not run | Implemented |
| Transaction Group create / rename / delete | `propose_create_transaction_group`, `propose_rename_transaction_group`, `propose_delete_transaction_group` | Transaction Group SemanticCommand | Document edit | Yes | `groupId` | n/a | `ai-proposal-provider.test.ts` | Catalog E2E authored; not run | Implemented |
| Phase add / update / delete | `propose_add_phase`, `propose_update_phase`, `propose_delete_phase` | Transaction Phase SemanticCommand | Document edit | Yes | `transactionId`, phase index | Canonical source cycles | `ai-proposal-provider.test.ts` | Catalog E2E authored; not run | Implemented; phase identity uses current canonical positional contract |
| Linked Signal add / remove | `propose_link_signal`, `propose_unlink_signal` | Transaction linked-Signal SemanticCommand | Document edit | Yes | `transactionId`, `signalId` | n/a | `ai-proposal-provider.test.ts` | Catalog E2E authored; not run | Implemented |
| Annotation read / create / update / delete | `get_annotations`, `propose_create_annotation`, `propose_update_annotation`, `propose_delete_annotation` | Canonical Annotation / Annotation SemanticCommand | Read-only / Document edit | Edit: Yes | `annotationId`, optional `signalId` | Canonical source cycles | `ai-proposal-provider.test.ts` | Catalog E2E authored; not run | Implemented |
| Bookmark read / create / move / update / delete | `get_bookmarks`, `propose_create_bookmark`, `propose_move_bookmark`, `propose_update_bookmark`, `propose_delete_bookmark` | Canonical Bookmark / Bookmark SemanticCommand | Read-only / Document edit | Edit: Yes | `bookmarkId` | Canonical source cycle | `ai-proposal-provider.test.ts` | Catalog E2E authored; not run | Implemented |
| Time Group read / create / update / delete | `get_time_groups`, `propose_create_time_group`, `propose_update_time_group`, `propose_delete_time_group` | Canonical Time Group + Time Group SemanticCommand | Read-only / Document edit | Edit: Yes | `timeGroupId` for update/delete | Canonical source cycles | `ai-proposal-provider.test.ts` | Catalog E2E authored; not run | Implemented; browser acceptance not run |
| Selection read | `get_selection` | Editor selection owner | Read-only | No | stable selected IDs | n/a | `ai-bridge-session.test.ts` | `ai-bridge.spec.ts` | Implemented |
| Set selection / reveal entity | `set_selection` | Editor SelectionOwner | View-only | No | Stable entity ID | n/a | `ai-bridge-client.test.ts` | `ai-bridge.spec.ts` | Implemented; browser acceptance not run |
| Fit all / fit selection | `fit_all`, `fit_selection` | Timeline navigation owner | View-only | No | Current selection for fit-selection | n/a | `ai-bridge-session.test.ts` | `ai-bridge.spec.ts` | Implemented; browser acceptance not run |
| Open panel / switch mode / set visible time range | — | View intent owners exist where applicable | View-only | No | Stable entity IDs/source range | Canonical source cycles | — | — | Not exposed by MCP |
| Problems read | `get_problems` | Canonical document validator | Read-only | No | n/a | n/a | `ai-bridge-session.test.ts` | Catalog E2E authored; not run | Implemented |
| View context / viewport | `get_document_summary`, `get_view_context`, `get_viewport_snapshot` | Canonical document / shared view context | Read-only | No | stable IDs in response | source cycles and zoom | `ai-bridge-session.test.ts` | `ai-bridge.spec.ts` | Implemented |
| General semantic fallback | `propose_edit` | Deterministic intent parser → SemanticCommand | Document edit | Yes | Selection context | Source cycles when applicable | `ai-proposal-provider.test.ts` | `ai-bridge.spec.ts` | Implemented fallback; typed tools preferred |

## MCP catalog parity

The names below must match the bridge `TOOL_CATALOG`; the security contract test checks this set against the source so additions cannot silently go undocumented.

`list_editor_sessions`, `get_document_summary`, `get_view_context`, `get_selection`, `get_viewport_snapshot`, `get_signals`, `get_signal`, `get_signal_groups`, `get_transactions`, `get_transaction`, `get_transaction_groups`, `get_transaction_phases`, `get_linked_signals`, `get_annotations`, `get_bookmarks`, `get_time_groups`, `get_problems`, `fit_all`, `propose_edit`, `propose_create_signal`, `propose_rename_signal`, `propose_update_signal`, `propose_move_signal`, `propose_insert_cycles`, `propose_delete_cycles`, `propose_move_range`, `propose_duplicate_range`, `propose_create_signal_group`, `propose_rename_signal_group`, `propose_move_signal_group`, `propose_delete_signal_group`, `propose_create_transaction_group`, `propose_rename_transaction_group`, `propose_delete_transaction_group`, `propose_create_transaction`, `propose_update_transaction`, `propose_move_transaction`, `propose_resize_transaction`, `propose_delete_transaction`, `propose_add_phase`, `propose_update_phase`, `propose_delete_phase`, `propose_link_signal`, `propose_unlink_signal`, `propose_create_bookmark`, `propose_move_bookmark`, `propose_update_bookmark`, `propose_delete_bookmark`, `propose_create_annotation`, `propose_update_annotation`, `propose_delete_annotation`.

`propose_create_time_group`, `propose_update_time_group`, `propose_delete_time_group`.

`fit_selection`.

`set_selection`.

## Verification state

- Focused AI/provider/session/security tests pass on the current branch; see PR #796 checks/comments for the exact commit-level result.
- `tests/e2e/ai-bridge.spec.ts` contains bridge, onboarding, read, and proposal acceptance cases, including Signal Group move/delete. Automated E2E remains pending.
- Codex in-app browser + local Agent Bridge: `initialize`, `tools/list` (56 tools), explicit-session `list_editor_sessions`, and `get_signal_groups` passed. `propose_move_signal_group` produced a stable-ID Preview with Canonical/History/Dirty unchanged; Cancel discarded it. `propose_create_signal_group` + human Validate/Apply created an empty group in one History entry; readback returned stable ID `group_phase9_1`. `propose_delete_signal_group` + human Validate/Apply removed it in one History entry. Nonempty deletion rejection is covered by the provider unit test. This was a local fixture session, not Codex/Claude production-client onboarding acceptance.
- Bridge liveness is a loopback-only, empty OPTIONS response. All data/MCP routes remain bearer-token protected.
- Neither bridge credentials nor transient proposals/activity enter Canonical document data.
