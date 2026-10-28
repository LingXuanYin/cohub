---
"@neta-art/cohub": minor
---

Boards gain `session` cards: write `props.sessionId` and the server keeps the card's title, latest message and failure state in sync with the chat.

- `editor.addSession(sessionId, snapshot, at)` places one; `BoardStageOptions.session` supplies live state (`BoardSessionLive`) drawn over the stored snapshot.
- `BoardRenderPalette` adds `activity`, `error` and `warning`; `BoardRenderLabels` adds `sessionUntitled`, `sessionLost` and `sessionUnavailable`.
- `space.sessions.list({ ids })` returns up to 100 given Sessions.
