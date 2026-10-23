---
"@neta-art/cohub": minor
---

Board events travel in the Board's own realtime room. `board.changed` and `board.playback.changed` reach only clients subscribed to that Board instead of every connection in its Space, so a busy Board no longer streams its deltas to people who are not looking at it. Board subscriptions hold the Board room alone, and `space.on` no longer offers `"board.changed"` or `"board.playback.changed"`.

Breaking for Space listeners: Board events no longer arrive in the Space room. Hosts: listen for Board changes through `space.board(id).subscribe`.
