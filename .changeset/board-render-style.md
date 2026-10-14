---
"@neta-art/cohub": minor
---

Give Board rendering a style layer and move selection chrome to the stage.

Themes now shape cards through `BoardRenderStyle` (silhouette, radius, shadow,
selection, media framing, progress, icons, motion and chrome font) alongside the
existing color palette, and every built-in renderer draws its surface through the
shared helpers in `render/surface.ts`. Cards no longer draw selection or hover
themselves: the stage overlay owns that chrome, so pointer and selection changes
redraw one layer instead of every affected card. Card chrome such as tags uses
`renderers/*.zoom`, a new optional hook for zoom-dependent sizing.

Breaking for custom card renderers: `BoardRenderContext` gained `style`,
`themeKey` and `liftedIds`, and `drawOverlay` moved off the scene onto
`drawBoardOverlay` in `board/stage`. Renderers that draw their own
selection outline should set `observesSelection` to keep being updated when the
selection or hover changes.
