# Recent document storage

Saving a document first creates the user-requested download and marks the saved revision clean. Recent recovery is auxiliary: small filename/title/document/size metadata stays in localStorage; the latest serialized payload is stored asynchronously as one IndexedDB record (`timing-chart-v2` / `recent-documents`, key `recent`). A failed IndexedDB write reports a warning but does not undo a successful download or change Canonical, History, or Dirty state. Open Recent waits for a pending write and then reads IndexedDB through the normal document-open path. A legacy localStorage document is accepted once and migrated after a successful IndexedDB write. IndexedDB stores only the most recent document.

For Save-path diagnosis, the Performance Timeline retains only the latest measure for each of these names:

- `timing-chart-v2.save.serialize`
- `timing-chart-v2.save.download`
- `timing-chart-v2.save.recent-metadata`
- `timing-chart-v2.save.recent-write`

Each measure's detail includes the serialized character count when available. These are diagnostic stage timings, not an SLO or a cross-runner benchmark.
