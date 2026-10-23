---
"@neta-art/cohub": minor
---

Board asset managers invalidate pictures per item: `invalidateItemAssets(ids)` re-reads `itemAsset` for those items only, and `invalidatePath` versions the keys of one file instead of recomputing every item's key. `stage.invalidate({ items })` also repaints the far plates holding those items, so a far card's color follows its new picture.

Hosts: when your data changes for some items, call `invalidateItemAssets(ids)` and `stage.invalidate({ items: ids })` instead of invalidating every card.
