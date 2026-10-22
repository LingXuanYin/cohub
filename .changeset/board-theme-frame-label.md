---
"@neta-art/cohub": minor
---

Board themes set frame titles with `style.frameLabelSize`; the title's position, the editor's hit box and the in-place editor follow it. The Neta themes draw 16px titles and a 1.5px selection that hugs the item, and Neta Studio selects in blue.

Hosts: custom `BoardRenderStyle` objects need `frameLabelSize`; build them with `resolveBoardRenderStyle`.
