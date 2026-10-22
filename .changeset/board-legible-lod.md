---
"@neta-art/cohub": minor
---

Boards keep cards visible as long as they are legible. Detail now depends on each card's size on screen rather than how many cards are in view: pictures stay real down to a few pixels, text fades to line bars, and the rest draw as plates painted only where they change. Panning a board full of images stays smooth: loads start where the view is heading, pictures fade in over several frames, small pictures hold small textures, and pictures panned away stay warm as compact copies instead of downloading again. `mountBoardStage` accepts `lod` (`DEFAULT_BOARD_LOD`, `COMPACT_BOARD_LOD`), stages report `stats()`, and asset managers add `focus`, `stats` and `shrinkTexture`.
