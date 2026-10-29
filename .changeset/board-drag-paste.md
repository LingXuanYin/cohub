---
"@neta-art/cohub": minor
---

A drag on a card inside a selected frame moves the whole selection, so a Select All drags as one; a click there still narrows to the card, and a card that opens on a tap still opens. A paste lands next to its copy while that spot is in view, and in the middle of the view once it is not; each repeat steps on from the last paste.

Hosts: `defaultPasteOffset` is removed. `pasteClipboard()` places a paste itself; pass `at` to choose the spot.
