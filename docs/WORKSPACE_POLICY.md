# Agent workspace policy

This policy applies to Codex, Claude, and other agents working in this repository.

## Before creating a workspace

1. Run `git worktree list --porcelain` from the authoritative checkout.
2. Prefer a registered Git worktree over a full sibling clone.
3. Give every temporary worktree a specific Issue/Goal, owner, branch, and cleanup condition.
4. Do not create `*-recovered`, `*-backup`, `*-worker`, or issue-specific sibling clones unless a concrete recovery or parallel-work need requires it.
5. Keep human browser use on the authoritative checkout; focused Playwright runs must use the run-owned server launcher.

## Before cleanup

Do not remove a workspace until its exact absolute path has been classified and checked for:

- tracked modifications, untracked files, and ignored artifacts;
- stash entries (stashes may be repository-wide, not per worktree);
- local commits not reachable from an intentional remote ref;
- active task/PR ownership and running processes that use the path.

Remove only clean, inactive registered worktrees whose commits are preserved remotely, using `git worktree remove <exact-path>`. Run `git worktree prune --dry-run --verbose` before any real prune. Never use `git reset --hard`, `git clean`, wildcard directory deletion, or kill-all-Node cleanup. Preserve independent backups/recovery copies and any workspace with ambiguous ownership or user data; record it as `NEEDS_REVIEW` instead.

## Handoff checklist

At task completion report:

- workspace path, branch, and HEAD;
- clean/dirty state and stash status;
- pushed/unpushed commits;
- whether the workspace is safe to remove and the evidence for that decision.

Future goals should link this policy and inspect registered worktrees before adding another workspace.
