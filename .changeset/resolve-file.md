---
"@neta-art/cohub": major
---

File URLs resolve through one call that also carries recorded media facts, so Boards size Space file textures without probing. `space.files.resolve(path, options)` replaces `resolveUrl` and returns `{ url, media? }` (`ResolvedFile`) or null. `BoardAssetSource` and `createBoardAssetManager` take one `resolveFile(path, { purpose, fresh })` returning the same shape, replacing `resolveFileUrl` and `resolvePlaybackUrl`.

Migrate `files.resolveUrl(path)` to `(await files.resolve(path))?.url ?? null`, and `{ resolveFileUrl: fn }` to `{ resolveFile: async (path, options) => { const url = await fn(path, options); return url ? { url } : null; } }`.
