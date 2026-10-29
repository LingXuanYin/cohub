---
"@neta-art/cohub": minor
---

The Board text tool works again: a click opens the editor where you clicked, and a sideways drag sets the wrap width, previewed while you drag. The editor opens on release, and the stage keeps the browser's default press focus from closing it, for mouse and touch alike. A text tool press while editing only ends that edit.

`BoardInteraction` gains `creatingText`, `beginTextDraft(at, width?)` accepts a wrap width, `createTextBoardItem` an optional `width`, and `boardTextGestureWrap` reports where a text drag places its text.
