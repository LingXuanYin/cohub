---
"@neta-art/cohub": major
---

Load Board resources only for live cards. `BoardRenderContext.acquireTexture` now receives the item and starts its load, so far-covered cards no longer resolve or download media; custom renderers that acquire textures must pass the item. `BoardAssetManager.subscribe` listeners receive the affected resource key, and the stage refreshes only the cards holding it instead of every live card.

Resolve file URLs outside texture slots and retry failed loads with `resolveFileUrl(path, { fresh: true })`. Raise the default texture concurrency to 6 and the cooling pool to 128 textures or 192 MB; `COMPACT_LRU_BUDGET` keeps the previous footprint for constrained devices. Add `onLiveChange` to stage options. A Board replica now shares unchanged items, settings and animations across reads, and confirming the cached version neither replaces the document nor rewrites the cache.
