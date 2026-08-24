# Semiconductor Timing Chart Editor V2

This workspace is the from-scratch V2 implementation boundary. Everything
outside `timing-chart-v2/` is reference-only and cannot be imported by this
workspace.

Phase 0 and Phase 1 are complete. The workspace now contains the version 2
canonical schema, deterministic v1 migration, semantic validation,
serialization, and atomic document Open/Save. It does not contain command
execution, history storage, WaveDrom rendering, geometry extraction, or a
production GUI.

## Commands

```bash
npm ci
npm run check
```

## Package direction

```text
apps/editor -> ui, commands, history, projection, renderer,
               wavedrom-adapter, geometry, export, core, schema
ui          -> commands
commands    -> core, schema
history     -> commands, core, schema
geometry    -> schema
wavedrom-adapter -> geometry, schema
projection  -> commands, core, geometry, schema
renderer    -> projection, geometry
export      -> core, geometry, schema
core        -> schema
schema      -> (none)
```

The authoritative package and state ownership declarations live in
`architecture/`. `scripts/check-boundaries.mjs` enforces them.
