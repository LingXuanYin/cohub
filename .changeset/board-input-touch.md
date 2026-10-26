---
"@neta-art/cohub": minor
---

Touch browses a Board with the hand tool, as Neta Studio does: a tap selects and switches to select, a touch away from the selection returns to the hand, and a select tool the host set keeps one marquee. A long press lifts the item for the same finger to move; released in place, or on empty space, it asks for the context menu. Double taps edit text, two- and three-finger taps undo and redo, a released pan glides, and once a pen is used fingers pan while drawing. Built-in media, file and task items open with a tap in read-only Boards (`activation: { readonly: "tap" }`); `onActivate` returning `false`, or no handler, selects them instead.

Hosts: `onLongPress` is removed. The stage lifts items itself; handle `onContextMenu({ item, world, clientX, clientY, pointerType })` for right clicks and long presses, and `onFeedback(kind)` for haptics or sound (`pickup`, `drop`, `menu`, `undo`, `redo`). Delete host code that switched tools on touch. `onHit` now fires on release, and a drag that starts on a key moves the card. Set `editor.enteredId` to let an item's view take input, like an embedded page; views get `context.entered` and should take input only while it is true. A press elsewhere or Escape leaves it.
