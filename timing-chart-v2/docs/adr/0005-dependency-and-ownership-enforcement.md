# ADR 0005: Executable architecture boundaries

- Status: Accepted for Phase 0
- Date: 2026-08-24

`architecture/packages.json` is the dependency allow-list and
`architecture/state-ownership.json` is the owner registry. The boundary gate
checks manifests and imports, rejects legacy references, restricts WaveDrom to
its adapter, keeps domain packages DOM-free, and rejects duplicate state keys.
CI runs this gate before tests and builds.
