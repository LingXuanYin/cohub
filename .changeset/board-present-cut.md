---
"@neta-art/cohub": minor
---

Presentations show one frame at a time: stepping cuts straight to the next frame instead of sliding past both, and the web app fades it in. `frameView` drops `previous`, and `drawBoardFrameMask` takes a single hole.

Hosts: drop reads of `frameView.previous`.
