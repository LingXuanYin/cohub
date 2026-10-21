---
"@neta-art/cohub": major
---

Render Board DOM views in world coordinates under one camera transform. Replace `BoardItemViewContext.zoom` and `--board-zoom` layout scaling with ordinary world-size CSS; declare `contentSize` and consume `context.detailed` for screen-size LOD. Focused views and active pointer streams are retained.

Stop producing script bitmaps for far-covered items, size interactive bitmaps to quantized screen demand, and separate execution-only wakeups from visual invalidation. `BoardScriptHost.frame` no longer accepts the previously ignored resolution argument. `update()` is no longer called when the zoom bucket or DPR changes. Custom renderers that update text resolution or zoom-dependent detail in `update()` must implement `resolution` instead. Keep uncovered real nodes only during the first progressive far pass, counting retained nodes against the live budget.
