---
"@neta-art/cohub": minor
---

Board items can open on a tap. Define a type with `activation: "tap"` and handle the stage's `onActivate`: a quick press opens the item without selecting it, a drag moves it without selecting it (or pans with the hand tool or read-only), and hovering shows a pointer instead of connection ports. `onLongPress` reports a still touch or pen; `editor.pickUp()` there picks the item up and drags it. The stage drops the click a touch screen sends after an opening tap. Renderers declare keys drawn on a card with `hitAt`; the stage shows their cursor, passes `context.hoveredHit` and routes presses to `onHit`. Media play keys use the same path (`BOARD_PLAY_MEDIA`). `editor.commitPatch` takes `{ record: false }` to keep a write out of undo, and the root entry exports `buildViewportContentBlock` with the viewport context types.

Hosts: replace pointer interception for opening cards, long presses and card keys with these options.
