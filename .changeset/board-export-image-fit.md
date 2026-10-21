---
"@neta-art/cohub": patch
"@neta-art/cohub-cli": patch
---

Fix `cohub boards export` drawing images, video posters, and task previews at their native pixel size, tiled or clipped, instead of fitted to their box. The Node renderer now provides the `DOMMatrix` that texture fills need.
