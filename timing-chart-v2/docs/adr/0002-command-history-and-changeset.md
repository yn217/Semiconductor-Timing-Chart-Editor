# ADR 0002: One semantic command path

- Status: Accepted and implemented in Phase 2
- Date: 2026-08-24

Ribbon, keyboard, menus, inspectors, AI, and future APIs receive the same
`SemanticCommandDispatcher`. One accepted user action produces one canonical
commit, one validation, one history entry, and one `ChangeSet`. View-only
actions never enter canonical history. Pure planners prepare candidates without
mutating Core; History orchestrates the sole revision-checked Core commit.
