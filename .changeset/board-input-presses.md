---
"@neta-art/cohub": minor
---

Board presses follow one set of rules, Figma's when editing and a browsing model for read-only, the hand tool and touch, all thresholds in `BOARD_INPUT`. A press drags past 4 CSS pixels for a mouse and 8 for touch, and a drag that lands where it began writes nothing. A second finger lands the drag so far before it pinches, lifting one finger of a pinch keeps panning, and Escape puts a drag back. Locked items are blank to presses and marquees; a frame with children is picked by its title, and a marquee begun inside it selects its children. A click on one of several selected items narrows to it on release, a shift-click removes a selected item on release, the gap inside a multiple selection drags it, and a drag over a frame shows it as the drop target (`editor.dropTargetId`). Read-only drags pan over items, touch reaches items within 8 pixels, and `editor.pickAt(point, pointerType)` is the hit test presses use.

Hosts: `canTapSelectWithHand`, `boardTapSlop`, `isWithinHandTapSlop`, `BOARD_TAP_MAX_MS`, `BOARD_HAND_TAP_SLOP` and `BOARD_MOUSE_TAP_SLOP` are replaced by `isTouchLikePointer`, `boardDragSlop` and `BOARD_INPUT`. `editor.pickUp()` returns the lifted item or null.
