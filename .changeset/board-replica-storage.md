---
"@neta-art/cohub": minor
---

Board replicas keep their cache and unsent writes in IndexedDB with `createIndexedDbBoardReplicaStorage({ userKey, spaceId, boardId })`, so a reload shows the last document at once and never loses an edit; `clearBoardReplicaStorage({ userKey })` forgets them on sign-out. Replicas read the Board again when realtime reconnects and resend pending writes when the network returns, and writes applied while storage loads are no longer dropped. `BoardRemote.subscribe` handlers gain `resync`, and `space.boards.open(target)` opens a Board by id or `.board` path.

Hosts: pass the IndexedDB storage to `createBoardReplica` and drop refresh polling.
