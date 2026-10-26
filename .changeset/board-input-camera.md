---
"@neta-art/cohub": minor
---

Board wheels and trackpads feel native. Each wheel stream is read once: a coarse first step is a mouse wheel and eases to its target, a trackpad follows the fingers one to one, ctrl or cmd zooms about the pointer, Safari's gesture events pinch, and pans just after a pinch are dropped. A stream begun in a scrollable DOM view scrolls it until it reaches its end. A drag pressed against the edge pans toward it, and a dragged item stays under the pointer while the camera moves. `handleBoardKeyDown` and `handleBoardKeyUp` run Figma's key bindings, including `shift+0/1/2` zoom.

Hosts: `editor.wheel` is replaced by `editor.scroll(dx, dy, smooth)` and `editor.zoomBy(point, factor, smooth)`; `normalizeWheelDelta` and `wheelZoomFactor` move to `board/stage`. Replace hand-written Board key handling with `handleBoardKeyDown(editor, event, host)`, where `host(command)` performs `copy`, `cut`, `paste` and `export`, and may open the selection on `open` before Enter edits its text.
