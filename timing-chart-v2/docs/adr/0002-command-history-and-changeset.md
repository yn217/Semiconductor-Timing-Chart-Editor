# ADR 0002: One semantic command path

- Status: Accepted for Phase 0
- Date: 2026-08-24

Ribbon, keyboard, menus, inspectors, AI, and future APIs receive the same
`SemanticCommandDispatcher`. One accepted user action produces one canonical
commit, one validation, one history entry, and one `ChangeSet`. View-only
actions never enter canonical history. Commands are implemented in Phase 2.
