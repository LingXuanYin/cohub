---
"@neta-art/cohub": major
---

Load Board image textures at their displayed size. `BoardAssetManager.requestItem(item, edge)` takes the edge from the new `boardTextureEdge(item, scale)` and loads the smallest CDN variant covering it, keeping the original for hosts that cannot resize; the stage sharpens live textures once zooming in or resizing settles, and swaps them without dropping the shown image. Space files on `sessions.cohub.live` now resize through OSS like other media hosts. `withTextures` accepts an `edge` option, task preview keys use the original cover URL, and `getNaturalSize` reports the original size, probing it once when only a variant is loaded. Raise the cooling pool to 512 textures (256 compact) within the same byte budget. Built-in renderers compare texture identity instead of dimensions, so custom renderers should do the same to pick up sharper textures.
