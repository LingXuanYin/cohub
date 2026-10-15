---
"@neta-art/cohub": patch
"@neta-art/cohub-cli": patch
---

Release intermediate native Canvas surfaces eagerly during Board exports, avoid redundant image copies, and release script drawing surfaces after each frame. Board CLI exports now preflight video dimensions, enforce a configurable decoded-image memory budget, and expose render-stage memory diagnostics through `NODE_DEBUG=cohub:board-export`.
