# AI Operation Architecture Draft

> Status: **Draft / non-normative**
>
> Purpose: future AI / agent operation of the Semiconductor Timing Chart Editor.
> This document records the current design direction only. It does **not** require immediate implementation.

## 1. Purpose

The editor should eventually be operable by both humans and AI without creating two separate data models or two separate mutation paths.

The intended architecture is:

```text
                   +------------------+
                   | Human GUI        |
                   +--------+---------+
                            |
                            v
+---------+        +--------+---------+        +----------------------+
| AI/LLM  +------->+ Semantic Command +------->+ Validation / History |
| Agent   |        | API               |        | Transaction / Undo   |
+----+----+        +--------+---------+        +----------+-----------+
     ^                      |                             |
     |                      v                             v
     |             +--------+---------+          +--------+---------+
     +-------------+ Query / Inspect   |          | Canonical .tcd   |
                   | API               |          | Document         |
                   +-------------------+          +------------------+
```

Core rule:

> **GUI and AI must converge on the same canonical document, validation rules, command semantics, history, Undo/Redo, Save/Open behavior, and rendering pipeline.**

AI must not become a privileged bypass around document invariants.

---

## 2. Current data model assessment

The current `.tcd` direction is suitable as the canonical basis.

The canonical document includes concepts such as:

```text
formatVersion
document
timeline
signalGroups
signals
annotations
transactions
constraints
bookmarks
timeGroups
checkSettings
```

Runtime-only state such as selection, view state, object indices, geometry cache, validation cache, WaveDrom cache, DOM state, and performance counters must remain outside the persisted canonical document unless explicitly promoted by product specification.

### 2.1 Canonical vs transient rule

Every user-visible property must have exactly one authoritative owner.

Example already adopted by the product:

```text
signal.display.visible
```

is the persisted authoritative Signal visibility state.

Do not maintain a second AI-only or transient source such as `view.hiddenSignals` and attempt to synchronize both.

### 2.2 Stable identity

AI operations must target stable IDs, not array indexes or screen coordinates.

Existing stable IDs for Signals / Annotations / Groups should continue to be used.

Before broad AI editing is implemented, all independently editable nested objects should also gain stable identity where practical, especially Signal change points.

Recommended future shape:

```json
{
  "id": "cp_01J...",
  "start": 6,
  "value": "5678",
  "comment": ""
}
```

A change point must not be identified only by `signals[17].values[4]` or only by its current `start` time.

Timeline Insert/Delete, reordering, and future migration can change those positions while the semantic object remains the same.

---

## 3. Non-goals

This design does **not** require:

- an AI-specific `.tcd` format;
- direct LLM access to DOM/SVG internals;
- direct LLM editing of WaveDrom SVG;
- direct JSON Pointer writes into arbitrary document paths;
- a specific transport such as MCP, REST, WebSocket, or local IPC;
- automatic acceptance of every AI proposal;
- storing derived geometry in the canonical document.

Transport can be decided later.

The semantic contract should remain stable regardless of transport.

---

## 4. AI access model

AI access should be divided into four classes:

```text
1. Query / Inspect
2. Analyze / Validate
3. Preview Mutation
4. Commit Mutation
```

The default AI workflow should be:

```text
Inspect -> Reason -> Propose -> Validate -> Preview -> Apply/Cancel
```

Direct mutation without preview may be supported later for explicitly trusted / low-risk automation, but it must still use the same Semantic Command layer.

---

## 5. Request envelope

All AI operations should use a common transport-neutral request envelope.

Draft shape:

```json
{
  "protocolVersion": 1,
  "requestId": "req_123",
  "documentId": "example.tcd",
  "baseRevision": 1842,
  "scope": {
    "type": "document"
  },
  "intent": {
    "type": "timing_analysis",
    "description": "Measure req_valid to ready latency and add an annotation"
  },
  "operation": {
    "name": "...",
    "arguments": {}
  }
}
```

### 5.1 `protocolVersion`

Version of the AI operation protocol, independent from `.tcd formatVersion`.

### 5.2 `requestId`

Client-generated correlation ID used for logs, Preview, Apply, Cancel, retry, and diagnostics.

### 5.3 `documentId`

Identifies the target open document/workspace.

### 5.4 `baseRevision`

Revision observed by the AI when it generated the operation.

This provides optimistic concurrency control.

### 5.5 `scope`

Limits the objects/time range the AI is allowed to modify.

### 5.6 `intent`

Human-readable and machine-readable reason for the operation.

Intent is audit/explanation metadata. It does not replace the concrete Semantic Command.

---

## 6. Revision and conflict control

Every committed canonical mutation should advance a monotonically increasing document revision.

Example:

```text
AI reads revision 1842
Human edits document -> revision 1843
AI submits mutation based on 1842
```

The application should reject or require rebase/review:

```json
{
  "status": "conflict",
  "error": {
    "code": "REVISION_CONFLICT",
    "expectedRevision": 1842,
    "currentRevision": 1843
  }
}
```

Do not silently apply a stale AI patch to a newer document.

This is required for future Human + AI and multi-agent workflows.

---

## 7. Scope and capability control

AI should not receive unlimited mutation authority by default.

Draft scopes:

```json
{ "type": "document" }
```

```json
{
  "type": "signals",
  "signalIds": ["req_valid", "ready"]
}
```

```json
{
  "type": "timeRange",
  "start": 20,
  "end": 40,
  "signalIds": ["req_valid", "ready"]
}
```

```json
{
  "type": "selection",
  "selectionToken": "sel_123"
}
```

A proposed mutation outside the authorized scope must fail with an actionable error such as:

```text
OUT_OF_SCOPE_MUTATION
```

Future capability flags may further restrict actions:

```json
{
  "permissions": {
    "read": true,
    "editSignals": true,
    "editTimeline": false,
    "editAnnotations": true,
    "deleteObjects": false,
    "save": false
  }
}
```

---

## 8. Query / Inspect API

AI should not need to ingest the entire document for every task.

Provide semantic, bounded queries.

Initial candidate operations:

```text
get_document_summary
get_document_revision
get_timeline
list_signal_groups
list_signals
get_signal
find_signals
get_change_points
get_time_range
list_annotations
get_annotation
list_transactions
list_bookmarks
list_time_groups
get_selection
get_validation_issues
validate_document
```

### 8.1 Example: get document summary

Request:

```json
{
  "operation": {
    "name": "get_document_summary",
    "arguments": {}
  }
}
```

Response:

```json
{
  "status": "ok",
  "revision": 1842,
  "result": {
    "title": "Read Transaction Timing",
    "timeBase": "cycle",
    "cycleCount": 500,
    "signalCount": 126,
    "annotationCount": 14,
    "transactionCount": 32,
    "referenceClock": "clk"
  }
}
```

### 8.2 Example: bounded time-range query

```json
{
  "operation": {
    "name": "get_time_range",
    "arguments": {
      "start": 120,
      "end": 160,
      "signalIds": ["req_valid", "ready", "rdata"],
      "include": ["changePoints", "annotations", "transactions"]
    }
  }
}
```

The application should return canonical semantic data, not SVG path data or display pixels unless a dedicated visual-diagnostics query is intentionally requested.

---

## 9. Semantic Command API

AI must not directly mutate arbitrary JSON paths such as:

```json
{
  "op": "replace",
  "path": "/signals/17/values/4/value",
  "value": "ABCD"
}
```

That representation is brittle because array order is not semantic identity.

Instead expose named domain operations.

Candidate commands:

### Signal / Group

```text
add_signal
remove_signal
rename_signal
move_signal
set_signal_role
set_signal_display_name
set_signal_visibility
set_signal_format
add_group
rename_group
move_group
```

### Change points / waveform semantics

```text
add_change_point
update_change_point
remove_change_point
move_change_point
set_change_point_comment
```

### Timeline

```text
insert_cycles
delete_cycles
set_reference_clock
set_timeline_range
```

### Annotation

```text
add_annotation
update_annotation
remove_annotation
set_annotation_visibility
add_measurement
```

### Navigation metadata

```text
add_bookmark
update_bookmark
remove_bookmark
add_time_group
update_time_group
remove_time_group
```

### Transaction / checks

```text
add_transaction
update_transaction
remove_transaction
set_constraint
remove_constraint
set_check_setting
```

The exact command list is not frozen by this Draft. The principle is frozen:

> **Commands target semantic object IDs and domain concepts, not storage layout or DOM structure.**

---

## 10. Command example

Instead of addressing a value by array index:

```json
{
  "operation": {
    "name": "update_change_point",
    "arguments": {
      "signalId": "rdata",
      "changePointId": "cp_rdata_006",
      "value": "ABCD"
    }
  }
}
```

The command owner must perform the same validation that the GUI performs, including width/literal checks and canonical consistency.

---

## 11. Batch / transaction operations

AI frequently needs to make several mutually dependent edits.

Support an atomic batch:

```json
{
  "operation": {
    "name": "batch",
    "arguments": {
      "atomic": true,
      "commands": [
        {
          "name": "add_bookmark",
          "arguments": {
            "time": 3,
            "name": "REQ"
          }
        },
        {
          "name": "add_measurement",
          "arguments": {
            "start": {
              "signalId": "req_valid",
              "changePointId": "cp_req_rise"
            },
            "end": {
              "signalId": "ready",
              "changePointId": "cp_ready_rise"
            },
            "label": "6 cycles"
          }
        }
      ]
    }
  }
}
```

Rules:

- all succeed or none are committed when `atomic=true`;
- one logical AI Apply should normally become one Undo history entry;
- validation runs before commit;
- failed batch returns command-level diagnostics;
- canonical state must not be partially modified after failure.

---

## 12. Preview / Apply / Cancel

AI mutation should normally have a two-phase user-facing flow.

### Phase 1: Preview

AI requests a preview:

```json
{
  "operation": {
    "name": "preview_commands",
    "arguments": {
      "commands": [
        {
          "name": "add_measurement",
          "arguments": {
            "start": {
              "signalId": "req_valid",
              "changePointId": "cp_req_rise"
            },
            "end": {
              "signalId": "ready",
              "changePointId": "cp_ready_rise"
            },
            "label": "6 cycles"
          }
        }
      ]
    }
  }
}
```

Application response:

```json
{
  "status": "preview_ready",
  "previewId": "preview_789",
  "baseRevision": 1842,
  "summary": "Add one 6-cycle measurement from req_valid to ready",
  "changes": {
    "created": ["ann_preview_1"],
    "updated": [],
    "deleted": []
  },
  "validation": {
    "errors": [],
    "warnings": []
  }
}
```

The UI may render the preview without mutating the authoritative document/history.

### Phase 2: Apply

```json
{
  "operation": {
    "name": "apply_preview",
    "arguments": {
      "previewId": "preview_789"
    }
  }
}
```

On success:

```json
{
  "status": "applied",
  "oldRevision": 1842,
  "newRevision": 1843,
  "historyEntryId": "hist_456"
}
```

### Cancel

```json
{
  "operation": {
    "name": "cancel_preview",
    "arguments": {
      "previewId": "preview_789"
    }
  }
}
```

Cancel must leave canonical document, Dirty state, and Undo history unchanged.

---

## 13. Preview invalidation

A Preview is tied to the revision it was calculated against.

If the canonical document changes after Preview generation, Apply should normally fail:

```json
{
  "status": "conflict",
  "error": {
    "code": "PREVIEW_STALE",
    "previewRevision": 1842,
    "currentRevision": 1844
  }
}
```

The AI should inspect/recompute rather than applying stale assumptions.

---

## 14. Validation and diagnostics

Every mutation response should return structured validation diagnostics.

Draft structure:

```json
{
  "severity": "error",
  "code": "BUS_VALUE_OVERFLOW",
  "message": "ABCD requires 16 bits but signal width is 8 bits",
  "object": {
    "kind": "changePoint",
    "signalId": "rdata",
    "changePointId": "cp_123"
  },
  "path": "signals[rdata].changePoints[cp_123].value",
  "suggestedFix": "Use a value representable in 8 bits or change signal width"
}
```

Errors should be actionable by another AI turn.

Avoid diagnostics that only say `invalid input` without object identity and reason.

---

## 15. Semantic anchors, not pixels

AI should refer to time/waveform positions semantically.

Preferred:

```json
{
  "signalId": "req_valid",
  "sourceCycle": 7,
  "point": "rising"
}
```

or, where available:

```json
{
  "signalId": "req_valid",
  "changePointId": "cp_req_rise"
}
```

Avoid using:

```json
{
  "x": 712,
  "y": 345
}
```

Display X/Y is derived geometry and may change with Zoom, Scroll, frozen panes, row spacing, folding, responsive layout, or rendering changes.

Canonical source time remains authoritative even if future Time Group folding changes display coordinates.

---

## 16. Optional visual diagnostics API

Some AI workflows may need visual information in addition to canonical data.

That should be a separate read-only diagnostics interface, for example:

```text
get_render_snapshot
get_visible_bounds
get_object_screen_bounds
get_geometry_diagnostics
get_overlap_diagnostics
```

These are **derived observations**, not editable canonical state.

A visual AI may use them to understand what the human currently sees, while semantic mutation still uses object IDs and commands.

Example:

```json
{
  "operation": {
    "name": "get_object_screen_bounds",
    "arguments": {
      "objectIds": ["req_valid", "ann_123"]
    }
  }
}
```

The response may include pixels, but those pixels must never become the identity of the object.

---

## 17. AI workflow examples

### 17.1 Analyze latency only

Human request:

```text
req_valid から ready まで何cycle？
```

Possible AI flow:

```text
get_signal(req_valid)
get_signal(ready)
get_time_range(...)
Analyze
Return: 6 cycles
```

No mutation required.

### 17.2 Analyze and add a measurement

Human request:

```text
req_valid から ready まで測って図にも入れて
```

Possible AI flow:

```text
1. Inspect signals/change points
2. Identify semantic anchors
3. preview_commands(add_measurement)
4. Application validates and renders preview
5. Human or trusted policy chooses Apply
6. apply_preview
7. One canonical history entry is created
```

### 17.3 Edit only selected signals

Human request:

```text
選択している3信号だけ名前を整理して
```

Application gives AI:

```json
{
  "scope": {
    "type": "selection",
    "selectionToken": "sel_55"
  }
}
```

Any proposed edit to an unselected Signal fails `OUT_OF_SCOPE_MUTATION`.

### 17.4 Add missing annotations after analysis

AI can query:

```text
get_validation_issues
list_annotations
get_time_range
```

Then propose only missing annotations.

The application remains responsible for duplicate-ID checks, reference validity, timeline validity, and rendering geometry.

---

## 18. Read-only analysis vs mutation

AI should explicitly declare whether it intends to modify the document.

Suggested modes:

```text
READ_ONLY
PREVIEW_ONLY
MUTATE_WITH_CONFIRMATION
TRUSTED_AUTOMATION
```

Initial implementation should favor:

```text
READ_ONLY
PREVIEW_ONLY
MUTATE_WITH_CONFIRMATION
```

`TRUSTED_AUTOMATION` can be introduced only after command/validation/history behavior is mature.

---

## 19. Human approval policy

Not every AI action requires manual approval forever.

Policy can depend on command risk.

Example future policy:

```text
Read/query                         -> automatic
Validation/check                   -> automatic
Navigation/view-only               -> automatic
Add non-destructive annotation     -> preview / configurable auto-apply
Rename/edit signal semantics       -> preview required
Timeline insert/delete             -> preview required
Delete canonical objects           -> explicit confirmation
Save/overwrite external source     -> explicit policy/confirmation
```

The command API should support this without changing canonical semantics.

---

## 20. AI explanation / audit log

Each AI proposal should be explainable without storing hidden chain-of-thought.

Record concise operation metadata:

```json
{
  "actor": {
    "type": "ai",
    "agent": "assistant",
    "model": "optional"
  },
  "requestId": "req_123",
  "intent": "Measure request-to-ready latency",
  "summary": "Added one measurement annotation: 6 cycles",
  "commands": ["add_measurement"],
  "baseRevision": 1842,
  "resultRevision": 1843
}
```

Do not require or store private model reasoning traces.

The audit record should focus on inputs, declared intent, concrete commands, diagnostics, and resulting revision.

---

## 21. GUI and AI command ownership

Long-term preferred direction:

```text
GUI button handler
  -> Semantic Command
  -> Validation / History
  -> Canonical mutation
  -> Render invalidation
```

and:

```text
AI operation
  -> Semantic Command
  -> Validation / History
  -> Canonical mutation
  -> Render invalidation
```

Do not implement a second AI-only mutation engine.

If an existing GUI path still mutates model state directly, AI implementation should not copy that pattern as a permanent architecture. It should migrate toward shared command ownership where practical.

---

## 22. Derived state that AI must not write directly

Examples:

```text
DOM nodes
SVG path data
WaveDrom generated SVG
screen X/Y
geometry cache
object index Maps
validation cache
performance counters
selection highlight elements
MiniMap bitmap/geometry
render cache keys
```

AI may request diagnostics derived from these, but cannot persist them as canonical document truth.

---

## 23. Signal / Comment Row typing

Current implementations may store Signal-like rows and Comment Rows in the same collection.

For AI/schema purposes, use an explicit discriminated type even if the storage array remains shared.

Conceptual example:

```json
{
  "kind": "signal",
  "id": "req_valid",
  "type": "binary"
}
```

```json
{
  "kind": "commentRow",
  "id": "comment_01",
  "title": "Address phase"
}
```

This reduces AI ambiguity and schema branching errors.

Whether the persisted arrays should eventually be physically separated is a later product/schema decision.

---

## 24. Transport options

The semantic API should be designed independently of transport.

Possible future adapters:

```text
MCP tools
HTTP/REST
WebSocket
local JavaScript bridge
Desktop IPC
CLI/stdin JSON protocol
```

A first implementation could expose the same command registry through more than one adapter without changing domain semantics.

### MCP-style example

Possible tools:

```text
timing.get_document_summary
timing.list_signals
timing.get_signal
timing.get_time_range
timing.get_validation_issues
timing.preview_commands
timing.apply_preview
timing.cancel_preview
```

Mutation tools should still take `baseRevision` and scope/capability context.

---

## 25. Error model

Use stable machine-readable error codes.

Candidate codes:

```text
REVISION_CONFLICT
PREVIEW_STALE
OBJECT_NOT_FOUND
DUPLICATE_ID
INVALID_REFERENCE
INVALID_SIGNAL_TYPE
INVALID_LITERAL
BUS_VALUE_OVERFLOW
INVALID_TIME_RANGE
OUT_OF_SCOPE_MUTATION
PERMISSION_DENIED
VALIDATION_FAILED
COMMAND_NOT_SUPPORTED
FORMAT_VERSION_UNSUPPORTED
COMPATIBILITY_MODE_RESTRICTION
```

Every error should include enough semantic context for an AI to recover safely.

---

## 26. Return diffs at semantic level

After Preview or Apply, return a compact semantic diff.

Example:

```json
{
  "changes": [
    {
      "kind": "annotation",
      "id": "ann_921",
      "change": "created"
    },
    {
      "kind": "signal",
      "id": "ready",
      "change": "updated",
      "fields": ["display.name"]
    }
  ]
}
```

Do not require AI clients to diff two entire documents to discover what happened.

A full canonical document snapshot may still be available as a separate operation when explicitly requested.

---

## 27. Undo / Redo requirements

AI changes are ordinary canonical history entries.

Requirements:

- one logical Apply should normally produce one Undo entry;
- Undo must restore exact pre-Apply canonical state;
- Redo must restore exact AI-applied state;
- Cancel Preview creates no history entry;
- validation failure creates no history entry;
- stale revision failure creates no history entry;
- actor/request metadata may be attached to the history entry for audit/display.

---

## 28. Save / Open requirements

AI operations do not own persistence semantics.

They call the same document commands and persistence boundary as the GUI.

Rules:

- AI cannot cause arbitrary runtime/cache state to leak into `.tcd`;
- canonical serializer remains whitelist-based;
- format migration remains owned by `.tcd` persistence code;
- future-version Compatibility Mode/source-protection requirements remain in force;
- AI Save/Save As must respect the same source-protection rules as human UI.

---

## 29. Performance requirements for AI operations

AI operations must use the same render invalidation architecture as GUI operations.

An AI annotation-only edit must not trigger unrelated WaveDrom regeneration merely because the caller is AI.

An AI batch should preferably perform:

```text
validate once / transactionally
commit canonical changes
create one history entry
coalesce render invalidations
paint final result
```

rather than fully rendering after every command in the batch.

This should align with the Command-to-Paint / profiling work tracked elsewhere.

---

## 30. Security / trust boundary

Treat model output as untrusted structured input.

Requirements:

- parse against a strict schema;
- reject unknown/unsupported commands unless explicitly forward-compatible;
- enforce scope and permissions in application code;
- validate all IDs/references/types/ranges;
- never execute arbitrary JavaScript from AI output;
- never map a natural-language instruction directly to unsafe filesystem or shell access through this protocol;
- canonical invariants are enforced by deterministic application code, not by trusting the model prompt.

---

## 31. Recommended schema additions before AI implementation

The following changes are worth deciding early because retrofitting them later is expensive:

1. **Stable IDs for Signal change points**.
2. Explicit discriminated types for editable row/object kinds.
3. A monotonic **document revision** available to API clients.
4. Stable command names / command registry.
5. Structured validation/error codes.
6. Semantic scope representation.
7. Preview ID and Preview lifecycle semantics.
8. Semantic diff result format.
9. AI/history actor metadata shape.

These can be specified before any external AI bridge is implemented.

---

## 32. Suggested phased implementation later

This is not a current implementation request. When AI work begins, a low-risk order is:

### Phase A — Read only

```text
get_document_summary
list_signals
get_signal
get_time_range
get_selection
get_validation_issues
```

No mutation.

### Phase B — Preview-only annotations

Support Semantic Command parsing/validation and visual Preview for non-destructive annotations.

### Phase C — Apply/Cancel + history

Add revision checks, Apply/Cancel, one Undo entry, semantic diff.

### Phase D — General editing

Signals, change points, timeline, transactions, constraints.

### Phase E — Multi-agent / automation

Permissions, scoped concurrent agents, trusted policies, orchestration.

---

## 33. Draft acceptance criteria for the future architecture

Before broad AI editing is considered production-ready:

- [ ] AI and GUI share canonical command semantics.
- [ ] No AI-only canonical data model exists.
- [ ] AI cannot mutate arbitrary JSON paths directly.
- [ ] Editable semantic objects have stable IDs where required.
- [ ] Requests include document revision/concurrency protection.
- [ ] Mutation scope is enforced by application code.
- [ ] Preview/Apply/Cancel are deterministic.
- [ ] Preview does not modify canonical document/history/Dirty state.
- [ ] One logical AI Apply normally creates one Undo entry.
- [ ] Structured validation errors are machine-actionable.
- [ ] Semantic diffs are returned after Preview/Apply.
- [ ] AI cannot directly write DOM/SVG/geometry/cache state.
- [ ] AI operations respect `.tcd` serializer/migration/Compatibility Mode rules.
- [ ] Batch commands are atomic when requested.
- [ ] Stale revision / stale Preview cannot silently commit.
- [ ] Scope violations cannot silently commit.
- [ ] Rendering invalidation remains localized and caller-independent.
- [ ] Audit metadata records declared intent + concrete command/result, not hidden reasoning.

---

## 34. Open design questions

The following are intentionally left open for later product decisions:

- Exact stable-ID format (UUID/ULID/prefixed generated ID/etc.).
- Whether change-point IDs become mandatory in `.tcd v2` or a later format version.
- Whether Comment Rows remain in `signals[]` storage or move to a distinct persisted collection.
- Exact selection-token lifecycle.
- Which operations may auto-apply without human Preview approval.
- Whether Preview uses an in-memory overlay model, derived diff model, or transactional clone.
- Whether MCP is the first public AI adapter.
- Whether AI can create saved automation recipes/macros.
- Multi-agent locking vs optimistic concurrency only.
- Fine-grained field-level conflict resolution after revision mismatch.

These questions should be resolved before depending on them, but they do not block documenting the architecture now.

---

## 35. Design summary

The intended long-term contract is:

```text
.tcd Canonical Document
        ^
        |
Canonical Semantic Commands
        ^
        |
Validation / Transaction / Undo / Revision
        ^
        |
Preview / Apply / Cancel
        ^
       / \
      /   \
   Human   AI
    GUI   Agent
```

Key principles:

```text
Stable IDs, not indexes.
Semantic time, not screen pixels.
Commands, not arbitrary JSON writes.
One source of truth, not synchronized duplicates.
Preview before risky mutation.
Revision checks before commit.
Scope/permissions enforced deterministically.
GUI and AI share the same mutation/validation/history architecture.
```

This document should be updated as the canonical data model and AI operation requirements mature.
