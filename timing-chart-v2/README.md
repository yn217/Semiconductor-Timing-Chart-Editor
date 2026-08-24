# Semiconductor Timing Chart Editor V2

This workspace is the from-scratch V2 implementation boundary. Everything
outside `timing-chart-v2/` is reference-only and cannot be imported by this
workspace.

Phase 0 contains contracts and executable architecture gates only. It does not
contain a production GUI, canonical parsing, command execution, WaveDrom
rendering, geometry extraction, or persistence behavior.

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
