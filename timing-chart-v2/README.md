# Semiconductor Timing Chart Editor V2

This workspace is the from-scratch V2 implementation boundary. Everything
outside `timing-chart-v2/` is reference-only and cannot be imported by this
workspace.

Phases 0 through 5 are complete. In addition to the version 2 canonical Core,
the workspace now contains pure semantic command planning, atomic command and
batch execution, timeline ripple editing, ChangeSets, Undo/Redo, and canonical
Dirty tracking and the pinned WaveDrom adapter. Canonical Signals convert to
temporary WaveJSON and default-skin SVG without entering persisted state. Local
Geometry Maps are extracted from the rendered cycle grid, brick uses, and skin
paths. Derived RowLayout drives identical Left/Frozen/Timing row shells while a
stable signal-owned surface retains heavy WaveDrom SVG identity across reorder
and virtualization. The production GUI includes Cycle, Transaction, and Combined
workspaces, document Open/Save, Undo/Redo, annotations, and export.

## Commands

```bash
npm ci
npm run dev
```

Use Node >= 22.12. Run these commands from `timing-chart-v2/` in the
authoritative checkout. `npm run dev` is a developer server, not a release
artifact. For production use, build with `npm run build` and serve
`apps/editor/dist/` with a static HTTP server.

Normal development uses focused checks for the affected behavior. Release
verification must use an independent clean checkout; see
[`docs/LOCAL_RELEASE.md`](../docs/LOCAL_RELEASE.md). GitHub Actions is not a
quality gate and no hosted workflow is configured.

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
