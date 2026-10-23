---
"@neta-art/cohub": minor
---

Board replicas read a Board once when they open. When realtime starts or resumes, a replica checks the version with a read that skips items and animations, `remote.get({ only: [] })`, and reads the whole Board only when it moved. A Board room the server refuses makes the replica read again, so a Board that became private or was deleted reports the error instead of going quiet. Rooms whose authorization could not be checked stay retained and are subscribed again with the reconnect backoff, rather than dropped.

Hosts: custom `BoardRemote`s may pass `get`'s `only` through to read less; ignoring it still works.
