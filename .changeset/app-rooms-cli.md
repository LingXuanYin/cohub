---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": minor
---

**App rooms beyond the App**: a room keeps the latest 1,000 published events (up to 512 KB), so a reconnect replays what it missed and `room.history()` shows a late joiner what came before. `room.invite()` lets someone outside the App join — a person in a terminal, or an Agent — and members now carry their `kind` (`user`, `agent`, `cli`) and an Agent's `model`. The new `cohub rooms` commands (`create`, `join`, `get`, `events`, `publish`, `presence`, `invite`, `leave`) and `client.rooms` hold a seat without a connection; `cohub rooms events --wait` returns when someone else publishes, so an Agent can wait in the background and wake to the room.
