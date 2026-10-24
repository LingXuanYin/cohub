---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": patch
---

Boards read incrementally. `board.get({ since })` returns the Board's metadata with `changes`, every write after that version oldest first (`[]` when nothing changed), or the whole Board when they are unavailable; `board.sync(cached)` brings a cached `{ version, document }` up to date in that one request, and `readBoardDocument(result, base)` applies any read to a document. Replicas with a cached copy now start, catch up and resync this way. `cohub boards get --since <version>` does the same.
