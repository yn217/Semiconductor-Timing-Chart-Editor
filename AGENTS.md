# Repository agent instructions

- Avoid excessive full-suite testing. Run the narrowest checks that prove the changed behavior.
- Before creating or cleaning up a Git worktree, follow [`docs/WORKSPACE_POLICY.md`](docs/WORKSPACE_POLICY.md).
- Preserve dirty, untracked, stashed, detached, or otherwise unclassified work. Never infer that a worktree is disposable from its name or age.
