# ChatGPT ↔ Local Codex Coordination Protocol

## Purpose

Use GitHub Issue #187 as the shared control plane between ChatGPT and the user's locally running Codex session, without OpenAI API usage or API-backed GitHub Actions.

## Coordination Issue

- Repository: `yn217/Semiconductor-Timing-Chart-Editor`
- Issue: `#187 [V2][ORCHESTRATION] ChatGPT ↔ Local Codex Shared Work Queue`
- Target implementation branch: `main`

## Task format

ChatGPT posts a top-level issue comment beginning with:

```text
[CODEX_TASK]
```

Each task should include at minimum:

- `task_id`
- `base_head`
- `region`
- `priority`
- Goal
- Allowed files
- Forbidden changes
- Acceptance
- Tests
- Required result fields

## Local Codex behavior

The local Codex session reads the oldest uncompleted `[CODEX_TASK]` comment in Issue #187 and executes only that task.

Codex must not infer a later queued task until the current task is finished.

Codex posts the result back to the same issue beginning with:

```text
[CODEX_RESULT]
```

The result must include:

- `task_id`
- branch
- starting HEAD
- final HEAD
- changed files
- tests run and exact PASS/FAIL state
- acceptance PASS/FAIL
- remaining gaps
- evidence/artifact paths or commit references where applicable

## Queue discipline

- One active task at a time unless the task explicitly defines parallel subagents.
- ChatGPT may prepare later tasks, but Codex must process them in issue-comment order unless dependencies explicitly say otherwise.
- If a new user observation overlaps the active task, record it for a later task instead of silently changing scope.
- If the current repository HEAD is newer than `base_head`, Codex must report that fact before deciding whether the task is still applicable.

## Safety / invariants

- Do not change Golden images, visual thresholds, or masks unless a task explicitly records an approved product decision.
- Do not weaken tests to match the current implementation.
- Do not overwrite unrelated dirty worktree changes.
- Do not change orchestration protocol files as part of ordinary product tasks.
- Preserve existing Harness provenance and sourceFingerprint rules.

## No API-backed orchestration

This protocol intentionally does not require `OPENAI_API_KEY`, `CODEX_OPENAI_API_KEY`, or any OpenAI API billing.

GitHub is used only as the shared queue and evidence/history store. ChatGPT writes/reads Issue #187 through the connected GitHub integration; the user's existing local Codex session reads/writes the same issue.
