# Local release procedure

GitHub Actions and paid hosted CI are not used. The removed architecture-gate
workflow must not be reinstated as a push, PR, scheduled, or manual workflow.
Repository rules must not require its former hosted checks.

## Verification

Use an independent clean checkout at the exact candidate commit, with Node
>= 22.12 and no dependency junctions into another checkout. From
`timing-chart-v2/`, run once for a release candidate:

```text
npm ci
npm run check
npm audit --audit-level=high
npx playwright install chromium
```

Then execute the bounded release smoke defined by Issue #1087 at 1280x720 and
1672x941. Do not substitute the historical full E2E suite. Record exact commands,
candidate SHA, OS/Node/npm/Chromium versions, results, reviewed audit exceptions,
and whether any dependency resolved outside the clean checkout. The dedicated
smoke entry point remains to be implemented under #1087; this document alone
does not establish release readiness.

## Artifact and rollback

`npm run build` produces `timing-chart-v2/apps/editor/dist/`. Serve that directory
over HTTP using the intended deployment's static server, and run the bounded
smoke against the built artifact, not only Vite development mode. Publish only
the verified artifact, with applicable license/notices accompanying it.

Keep an immutable copy of each deployed artifact with its full source SHA and
release notes. Rollback switches the server to the previously verified artifact;
do not rebuild an old version with a different lockfile. Preserve saved user
documents and verify schema compatibility before rollback.

## Release identity

The initial public version/channel requires owner confirmation (#1089). Internal
workspace package versions of `0.0.0` are not a public release identity. Once
confirmed, create an annotated `v<version>` tag on the verified source commit;
record its full SHA, verification evidence, artifact identity, deployment target,
and rollback target in `docs/releases/<version>.md`. Never move a published tag.
Distribution terms require owner confirmation under #1088 before distribution.
