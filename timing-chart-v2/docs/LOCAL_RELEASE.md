# Local release procedure

This repository does not use GitHub Actions as a quality gate. Run release
verification locally from a clean checkout, using Node.js 22.12 or newer.

## Candidate verification

Start from the exact, clean `main` commit proposed for release:

```sh
git status --short
git rev-parse HEAD
npm ci
npm run release:verify
```

`release:verify` is intentionally a candidate-level command, not the normal
edit loop. It runs the repository check, the high-severity dependency audit,
the focused release browser smoke against the development server, and the same
smoke against the built production artifact. The second smoke uses Vite Preview
and does not replace the production build with test-only application code.
Record the commit SHA and command result in the release notes. Do not use a
dirty checkout or treat a successful `npm run dev` session as release evidence.

## Release identity and source tag

The product source license is MIT (`../../LICENSE`). The workspace package
version remains `0.0.0` and is not the product release identity.

The approved initial release identity is **`v0.1.0-beta.1`** (beta channel).
This identifies the planned first release; it does not mean that a release has
been verified, published, or deployed.

After all release gates are satisfied on the exact candidate commit, create the
annotated source tag `v0.1.0-beta.1` directly on that commit and record the tag
and full commit SHA in `docs/releases/v0.1.0-beta.1.md`. Do not create or move
the tag before verification and publication approval. Never move an existing
release tag to a different commit. If the candidate needs changes before the
tag is created, verify the final candidate first; do not invent a replacement
version without an owner decision.

## Build artifact and serving

`npm run build` creates the production web application in
`apps/editor/dist/`. This directory is the release artifact; keep it associated
with its source tag/SHA and do not commit generated build output. Serve its
contents through a static HTTP server configured to return `index.html` for
application routes. `npm run dev` is for development and is not a deployable
release artifact.

The repository does not prescribe or configure a hosting provider. Before a
public deployment, record the chosen host, public URL, and deployment-specific
steps with the release notes; do not put credentials in this repository.

## Release notes and rollback

Store one release note at `docs/releases/<tag>.md` with at least:

- approved version/channel and annotated tag;
- full source commit SHA;
- `release:verify` result and environment;
- notable changes and known limitations;
- artifact location and deployment URL.

Retain the previously deployed, verified artifact as an immutable versioned
directory alongside each new artifact. To roll back, point the static host back
to the previous artifact directory and verify that the application loads. Keep
the failed candidate for diagnosis; do not overwrite the prior artifact or
retag its source commit. The exact host command is deployment-specific and must
be recorded in that release's notes.

## Publication status

The initial version/channel and distribution license have been decided. The
release remains unpublished until the candidate passes the verification and
deployment steps above. Do not describe the version as released, create the
source tag, or announce it based only on this policy or the release-note
template.
