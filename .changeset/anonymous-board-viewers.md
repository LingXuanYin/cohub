---
"@neta-art/cohub": minor
---

Signed-out viewers can follow public Boards live. `createCohubClient({ websocket: { anonymous: true } })` connects without an access token as an anonymous viewer: Board subscriptions receive changes and playback as they happen, without who made them, while awareness, Space and user rooms stay closed. The `auth` event reports `anonymous`, and `isRoomLive(room)` tells whether a room's events are arriving.

Hosts: pass `websocket: { anonymous: true }` for signed-out visitors and drop Board polling while the Board room is live.
