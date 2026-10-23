---
"@neta-art/cohub": minor
---

`itemAsset` pictures can be Space files. `BoardAssetRef` takes `src`, a Space path resolved through `resolveFileUrl` like an image item's or a URL the page can load, in place of `url`; Space files get the same screen-sized CDN variants, cache entries and `invalidatePath` refreshes as built-in cards. Cropped pictures (`fit: "cover"`) key as `cover:` followed by the plain key, and `boardAssetRefKey` returns null for an empty `src`.

Hosts: rename `url` to `src` in `itemAsset` results and pass Space paths as they are.
