---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": minor
---

Board views and CLI writes now use one media-sizing rule. Exports match the Cohub app's colors, card styles, fonts and previews, including video covers from Cohub-hosted media. Texture selection follows a decoded-memory budget instead of a 64-image cap. Emoji render in color, and Node exports use the variable Geist fonts.

Breaking for direct export callers: `selectBoardExportAssets` now takes `{ scale, maxBytes? }`; `boardImageKeySource` is replaced by `boardAssetKeySource`, and `boardAssetKey` / `boardTextureEdge` move from `board/stage` to `board`. The SDK adds `boardRenderTheme`, `BOARD_THEME_IDS`, `settleBoardMediaSizes` and media probe helpers.
