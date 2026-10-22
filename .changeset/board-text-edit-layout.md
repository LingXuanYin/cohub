---
"@neta-art/cohub": minor
---

Editing a frame title or an arrow label now opens the editor exactly over the canvas text, in the same font, size and position. `boardTextEditLayout` from `board/render` returns that placement for text, shape, frame and arrow items, and `boardEditableText` from `board` returns the text an editor edits.

Hosts: place in-place text editors with `boardTextEditLayout` instead of computing their geometry.
