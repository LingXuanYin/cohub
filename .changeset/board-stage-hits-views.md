---
"@neta-art/cohub": minor
---

`mountBoardStage` takes `handlesHit(item, action)`: card keys it rejects show no cursor and their presses go to the editor, so a play key the host does not open no longer looks clickable. `viewLayer: "below"` puts DOM views under the canvas, so selection, arrows and strokes draw over them; pair it with a theme that sets `imageBackground`.

Hosts: no action.
