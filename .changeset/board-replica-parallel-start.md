---
"@neta-art/cohub": minor
---

Board replicas read the server while their local cache loads instead of after it, so a slow or stalled IndexedDB no longer delays the first document. The cached document still shows first whenever it arrives before the server answers.

Hosts: no action.
