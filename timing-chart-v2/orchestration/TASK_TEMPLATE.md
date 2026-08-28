# Shared Issue Task Template

Use this template for comments in GitHub Issue #187.

```text
[CODEX_TASK]
task_id: <unique-id>
base_head: <expected branch head>
region: <visual/product/architecture region>
priority: P0|P1|P2

Goal:
<one narrow outcome>

Allowed files:
- <path>

Forbidden changes:
- Golden images
- visual thresholds
- masks
- unrelated regions

Acceptance:
- <mechanical condition>
- <mechanical condition>

Tests:
- <command/test>

Required result:
- task_id
- branch
- starting HEAD
- final HEAD
- changed files
- test PASS/FAIL
- acceptance PASS/FAIL
- remaining gaps
```

Codex posts the outcome to the same issue using:

```text
[CODEX_RESULT]
task_id: <same-id>
status: PASS|FAIL|BLOCKED
branch: main
start_head: <sha>
final_head: <sha>

Changed files:
- ...

Tests:
- ...

Acceptance:
- ...

Remaining gaps:
- ...
```

This queue is intentionally manual on the Codex execution side and does not use OpenAI API billing.
