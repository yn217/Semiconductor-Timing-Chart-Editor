# Agent status workflow

`.agents/PLAN.yaml` is the only hand-maintained planning file. It records the owner, priority, area, dependencies, and optional hold reason for each tracked Issue.

`npm run reconcile:agent-status` reads live GitHub Issue state and generates:

- `.agents/STATUS.json`
- `.codex/ISSUE_ORDER.txt`
- `.codex/AGENT_ASSIGNMENT.md`
- `docs/PROJECT_STATUS.md`

GitHub state is authoritative. Issue body progress prose is never parsed as a database. Open Issues whose dependencies are open are blocked; closed Issues are completed; only open, unheld Issues with all dependencies closed enter an owner's ready queue.

The workflow runs on Issue state changes, pushes that modify `PLAN.yaml`, and manual dispatch. Generated files are committed to `main` with `[skip ci]`; the workflow ignores generated paths so that its own commit cannot loop. `PLAN.yaml` lives on `main` so it is reviewed with implementation history. `codex-control` remains read-only to implementation work; its generated snapshot can be updated by a separate controlled operation when needed.

For a progress check, read the latest `main` and `.agents/STATUS.json` first, then inspect only the relevant Issues.
