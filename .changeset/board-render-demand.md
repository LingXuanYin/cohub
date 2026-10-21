---
"@neta-art/cohub": major
---

Render Board DOM views in world coordinates under one camera transform. Replace `BoardItemViewContext.zoom` and `--board-zoom` layout scaling with ordinary world-size CSS; declare `contentSize` and consume `context.detailed` for screen-size LOD. Focused views and active pointer streams are retained.

Stop producing script bitmaps for far-covered items, size interactive bitmaps to quantized screen demand, and separate execution-only wakeups from visual invalidation. `BoardScriptHost.frame` no longer accepts the previously ignored resolution argument. Renderers can implement `resolution` to refresh zoom-bucket and DPR-dependent content without global card updates. Keep uncovered real nodes until the progressive far layer replaces them.
