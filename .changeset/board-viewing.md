---
"@neta-art/cohub": minor
---

Boards remember and share where they open. `editor.cameraState()` reads the view as a center and zoom that survive resizing, and `editor.restoreCameraState(view)` shows it again, fitting the Board when nothing is in sight. `parseBoardLaunch` and `formatBoardLaunch` read and write `#focus=`, `#view=` and `#play=…&t=` fragments, and `stateForCamera` complements `cameraForState`. `parsePublishedBoard(json, manifestUrl)` reads a published Board artifact into a document and an asset source for its captured files.

Hosts: no action. Hosts that keep their own camera memory can replace its conversion with `cameraState` and `restoreCameraState`.
