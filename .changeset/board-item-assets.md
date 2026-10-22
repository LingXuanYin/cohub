---
"@neta-art/cohub": minor
---

Boards load pictures for your own item types through the same pipeline as built-in cards. Give `createBoardAssetManager` an `itemAsset` that maps an item to `{ url, media?, fit? }`; those pictures get screen-sized CDN variants, loads ordered by where the view is heading, prefetch, compact copies when panned away, device budgets, one shared cache and exports. `fit: "cover"` sizes the short edge for pictures cropped to fill their box. Call `invalidateItemAssets()` when the data `itemAsset` reads changes, and use `boardAssetRefKey` to look a picture up by URL.

Hosts: replace asset manager wrappers with `itemAsset`. `BoardAssetManager` is meant to be built by `createBoardAssetManager` and gains members as the SDK grows.
