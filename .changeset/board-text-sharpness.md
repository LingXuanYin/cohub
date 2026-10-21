---
"@neta-art/cohub": minor
---

Render Board text pixel-exact at any zoom and display scaling. Text rasterises at the exact screen density once the camera rests and steps by powers of two while it moves; refreshes run over several frames, starting nearest the viewport center. The canvas backing store follows the device-pixel content box, and the pixel budget now fits 4K screens.

Breaking changes for custom renderers and direct scene users:

- `BoardRenderContext` requires `textResolution`, the text raster density in texels per world unit.
- `syncTextResolution(text, state, zoom)` becomes `syncTextResolution(text, resolution)`; `textResolutionForZoom` is removed.
- `createBoardScene` renames `onFarLayerFrame` to `requestFrame`.

Custom renderers that draw text should apply the context density on update and in the `resolution` hook:

```ts
resolution: (container, _item, context) => {
  const label = labels.get(container);
  if (label) syncTextResolution(label, context.textResolution);
},
```
