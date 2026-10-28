---
"@neta-art/cohub": minor
---

Board scripts become sturdier, cheaper and more capable.

- Items that leave a script's scope (deleted, dragged out of a Frame, undone) drop their presentation instead of stopping the script.
- Instances share a pool of up to four workers, each importing its own modules; a Board runs up to 1000. Scripts of one Board form one trust domain.
- Commits within 5 s of this viewer's input save undoably here; other commits are written once, outside the undo history, by the editor `BoardStageOptions.scriptLeader` elects. Writes coalesce, and a commit may attach modules already running in scope, so scripts can spawn living items.
- `ctx.items`, `change` events (by `user`, `script` or `remote` source) and non-capturing `gesture` events for this viewer's drawing tools; `selectionchange` adds `total`.
- Hit regions take taps under the hand tool and opt into other tools with `tools`.
- `scene()` keeps a world and a screen layer at once; items without `z` stack in declaration order and screen UI sits above the Board. `present()` accepts `z`.
- Modules may export `frameRate` and `pixelated`; `ctx.layoutText()` measures native text.
- Negative scale mirrors instead of turning items over; cut-out images skip the card that framed themes draw.
- `@neta-art/cohub/board/testing` runs a Board's scripts headlessly with the app's input and commit rules.

Hosts: `BoardScriptOutput` replaces `items` and `space` with `world` and `screen`; `ctx.commit()` resolves a boolean; `BoardAssetManager` adds `isCutout()` and `readTone` returns `{ color, cutout }`; `BoardClient.connectionId` identifies the client in awareness.
