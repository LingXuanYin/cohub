---
"@neta-art/cohub": minor
---

Space file reads share requests. `space.files.read` calls made in the same task become one batched read per 32 files, and concurrent reads of a file share one request; a lone read keeps its plain request. `space.files.resolveUrl` resolves through the same reads and, in browsers with realtime, remembers URLs per signed-in user in memory and IndexedDB: a reload shows Board pictures without resolving them again, remembered URLs are confirmed in the background, and `space.fs.changed` events drop them. `resolveUrl` takes `fresh` to skip remembered URLs, and `space.files.onUrlChange` reports files whose URL changed.

`space.boards.assetSource()` returns a Board asset source over these URLs, and `createBoardAssetManager` takes the source's `subscribe` to reload pictures whose file changed, so hosts no longer forward file changes to `invalidatePath`. `clearFileUrlCache()` forgets remembered URLs.

Single file reads wait up to 5 seconds for CDN delivery, as batched reads do, then answer `preparing`; `resolveUrl` keeps polling until its own deadline.

Hosts: build Board asset sources with `space.boards.assetSource()`, pass the source to `createBoardAssetManager`, and call `clearFileUrlCache()` on sign-out. Pictures follow file changes while the Space is subscribed (`space.subscribe`); otherwise remembered URLs are confirmed again after a minute.
