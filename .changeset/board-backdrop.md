---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": patch
---

Board backgrounds are layers: `board.background` holds an optional `color`, `image` (`{ src, fit, opacity }`, a public URL or Space path) and `pattern` (`none`, `dots` or `grid`), and `board.grid` holds `size` and `snap`. Layers left out follow the theme. Migration `0076_board_background_layers` rewrites stored settings, history and Save snapshots (now version 4); writes in the old shape are rejected. The stage draws the backdrop on the GPU: patterns keep their screen size, merge as the view zooms out and stay crisp while panning, and images load through the shared texture pool. Built-in themes show a 24px dot grid (square on the pixel themes). Themes declare their own `backdrop`, and `resolveBoardBackdrop(settings, theme)` resolves one for previews and exports. The canvas is now opaque.

Hosts: drop `imageBackground` from stage themes and paint no backdrop behind the canvas; pass a theme `backdrop` instead. `viewLayer: "below"` needs `transparent: true`. Exports take `backgroundTexture` for `document.board.background.image` in place of `backgroundImage`.
