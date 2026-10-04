# Agent workspace policy

This policy applies to Codex, Claude, and other agents working in this repository.

## Before creating a workspace

1. Run `git worktree list --porcelain` from the authoritative checkout.
2. Prefer a registered Git worktree over a full sibling clone.
3. Give every temporary worktree a specific Issue/Goal, owner, branch, and cleanup condition.
4. Do not create `*-recovered`, `*-backup`, `*-worker`, or issue-specific sibling clones unless a concrete recovery or parallel-work need requires it.
5. Keep human browser use on the authoritative checkout; focused Playwright runs must use the run-owned server launcher.
6. Reuse a suitable active worktree before creating another. When a new managed worktree is necessary, place it under the repository's designated worktree parent rather than beside the primary checkout; record its base SHA and exact path in the task/PR.
7. Start from the current integration branch unless the task explicitly names another base. Periodically merge completed work so Issue branches do not accumulate from stale `main`.

## Before cleanup

Do not remove a workspace until its exact absolute path has been classified and checked for:

- tracked modifications, untracked files, and ignored artifacts;
- stash entries (stashes may be repository-wide, not per worktree);
- local commits not reachable from an intentional remote ref;
- active task/PR ownership and running processes that use the path.

Remove only clean, inactive registered worktrees whose commits are preserved remotely, using `git worktree remove <exact-path>`. Run `git worktree prune --dry-run --verbose` before any real prune. Never use `git reset --hard`, `git clean`, wildcard directory deletion, or kill-all-Node cleanup. Preserve independent backups/recovery copies and any workspace with ambiguous ownership or user data; record it as `NEEDS_REVIEW` instead.

Before classifying a workspace as removable, also verify staged and unstaged diffs, untracked and ignored files, repository-wide stashes, branch-only commits, PR/task ownership, and processes using the path. Unknown or dirty state is `NEEDS_REVIEW`, never an inferred cleanup candidate. Git's ordinary `worktree remove` and `branch -d` are the safety checks; if either refuses, stop and investigate rather than forcing deletion.

## Completion and integration

For implementation work, use this lifecycle:

```text
implementation -> focused verification -> PR or documented no-PR disposition
-> merge to main -> verify main -> remove clean registered worktree
-> delete local branch with `git branch -d`
```

Do not remove a worktree merely because its Issue/PR is closed. Confirm all useful changes and evidence are merged or preserved first. Keep remote branches when history retention is intentional; local cleanup must not destroy the only copy of any change.

## Handoff checklist

At task completion report:

- workspace path, branch, and HEAD;
- clean/dirty state and stash status;
- pushed/unpushed commits;
- whether the workspace is safe to remove and the evidence for that decision.

Future goals should link this policy and inspect registered worktrees before adding another workspace.
