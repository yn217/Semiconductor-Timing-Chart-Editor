# Recent document persistence

The Save command's authoritative operation is the user-selected file download. Recent-document recovery is auxiliary and must not synchronously duplicate the serialized document into Web Storage.

- The latest serialized document is stored as one record in IndexedDB (`timing-chart-v2` / `recent-documents`, key `recent`). A later successful Save replaces that record, so the application retains at most one recent payload.
- The Save hot path starts this IndexedDB write asynchronously after the download and clean-state update. Storage failures are reported as warnings and never turn a successful file save into a failed save or alter Canonical, History, or Dirty state.
- `localStorage` key `timing-chart-v2.recent` contains only small metadata (`filename`, `savedAt`, and character count); it is not the document recovery payload.
- Open Recent awaits any in-flight recent write, then asynchronously reads IndexedDB. On first use after an older version, a legacy full-document value at the metadata key is recognized, opened through the existing Open flow, and migrated to IndexedDB.
- If recent storage is unavailable, the downloaded file remains valid; use File > Open to reopen it. Existing local documents and recent recovery data are not deleted by storage failures.
