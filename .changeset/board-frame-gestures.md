---
"@neta-art/cohub": patch
---

Frames behave like containers on the canvas. Dragging blank space inside a selected frame moves the frame with its contents, and a marquee started inside a frame also selects the cards resting on it, without selecting the frame itself. A frame made with the frame tool nests in the frame it lands inside, and a dragged-out one also adopts the unlocked items it fully encloses, in one undoable change; moving or resizing a frame never adopts items. A moved frame's clipping now follows it instead of cutting its children at the old edges.

Hosts: no action.
