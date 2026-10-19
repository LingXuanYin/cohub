---
"@neta-art/cohub": patch
---

Expose `createBoardPointerGestures` from `board/stage` for draggable DOM item views. It tracks active pointers on the document, keeps a mouse drag going after pointer capture is lost, and cancels on window blur or page hide. Stage gestures now use it, so drags started on the board also survive capture loss; touch and pen still end on capture loss.
