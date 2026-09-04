# Validation Rule Contract

This document defines the ownership boundary for validation and operation
diagnostics in V2. It is a compatibility contract, not a second validation
implementation.

## Three rule layers

### Schema / structural validation

`packages/schema/src/canonical-document.schema.json` and the AJV validator own
shape-level rules: required properties, primitive types, enums, bounds, stable
ID patterns, and allowed properties. Their inventory is
`SCHEMA_RULE_KEYWORDS`, exposed as `schemaRuleDescriptors()` with
`layer: "schema-structural"` and `owner: "schema-ajv"`.

### Canonical invariants

`validateCanonicalDocument()` owns facts that must be true of every canonical
document: unique IDs, reference integrity, row membership, timeline bounds,
anchor semantics, and cross-object consistency. The exhaustive inventory is
`CANONICAL_PROBLEM_CODES`; `canonicalRuleDescriptors()` assigns each code to
`layer: "canonical-invariant"`, `owner: "canonical-validator"`, a path
pattern, entity context, fixability, and `ruleVersion`.

The validator is authoritative for canonical validity. `DocumentSession.commit`,
untrusted Open, and the public serializer retain the final validation boundary.
`allErrors` remains enabled; callers must not weaken validation to make a
command or render path pass.

### Command policy

`packages/commands/src/policy.ts` owns operation-specific decisions such as
whether an attempted command is rejected or is a no-op. Its exhaustive typed
inventory is `COMMAND_POLICY_CODES`, exposed with
`commandPolicyDescriptors()` and `layer: "command-policy"`.

Command policy may call canonical helpers for preflight, but it must not move
operation policy into the schema or canonical validator. A policy message can
add command context while retaining the policy code; a canonical fault returned
by final validation keeps its canonical code.

## Stable code inventory and compatibility

The arrays and descriptors above are the machine-readable inventory. They are
intentionally exhaustive and covered by:

- `tests/schema/validation-rule-contract.test.ts` for schema/canonical code
  coverage and representative `code`, `path`, and `entityId` results;
- `tests/commands/semantic-commands.test.ts` for command-policy code coverage;
- `documentProblemRuleDescriptor()` and `problemMatchesFilter()` for metadata
  consumers that do not parse human-readable messages.

`DocumentProblem` is the workflow transport envelope and may carry operation,
stage, object, and recovery context. Rule ownership is resolved from its code;
the Problems panel and review workflow must use descriptors rather than infer
ownership from `message` text. Derived Problems are never persisted in the
canonical document.

A rule-code change requires an explicit compatibility decision in the same
change:

1. keep the code and update its descriptor/ruleVersion only when semantics are
   unchanged;
2. add a new code and document the old-code compatibility or deprecation path
   when semantics change; or
3. retain an adapter at the boundary when an external consumer still requires
   the old code.

The change must update the typed inventory, descriptor coverage, representative
code/path/entity tests, and any CLI/CI or UI contract that consumes the code.
Renaming a function or changing a message alone is not a valid compatibility
decision.

## Non-goals

This contract does not introduce a quick fix for every rule. Current canonical
descriptors explicitly use `fixability: "none"`; a future safe fix must add
explicit metadata and tests rather than treating every validation error as
auto-fixable.
