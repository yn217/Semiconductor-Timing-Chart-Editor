# Timing constraint JSON

The canonical `constraints` array supports a `latency` constraint for checking
that one signal edge is followed by another edge within an inclusive cycle
range:

```json
{
  "id": "constraint_req_ack_latency",
  "type": "latency",
  "data": {
    "triggerSignalId": "sig_req",
    "triggerEdge": "rising",
    "responseSignalId": "sig_ack",
    "responseEdge": "rising",
    "minCycles": 1,
    "maxCycles": 3
  }
}
```

`minCycles` and `maxCycles` are inclusive, non-negative integers. An edge is a
known low-to-high or high-to-low transition between adjacent values on a
`binary`, `logic`, `bus`, or `pulse` signal. For each trigger edge, the checker
matches the next response edge at or after that trigger; each response edge is
used at most once. A missing response or a latency outside the range produces
a deterministic Protocol diagnostic in Problems. Invalid IDs, signal kinds,
edge names, or cycle bounds produce `LATENCY_CONSTRAINT_INVALID`.

The constraint is ordinary canonical document data: it is saved and reopened
with the rest of the document. Derived pass/fail findings are not persisted.
