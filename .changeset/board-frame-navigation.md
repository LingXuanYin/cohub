---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": minor
---

Boards step through frames like pages, in two dimensions, and present them. Top-level frames read in rows by where they sit; `N` and `Shift+N` move through them, arrow keys move by direction, read-only Boards swipe between them on touch and toggle one with a double tap, and focusing a selected frame shows it. A presentation fills the screen with the frame, covers everything around it and moves on with clicks, taps, swipes and keys. The editor exposes `frames`, `frameView`, `goToFrame`, `stepFrame`, `frameNeighbor`, `toggleFrameAt`, `exitFrameView` and `frameInset`; the model adds `boardFrameRegions`, `boardReadingOrder`, `boardRegionNeighbor` and `boardRegionStep`; `#focus=<frame>` now opens framed instead of selecting the frame, and `&present` launches a presentation. `cohub boards frames` lists the order and where each arrow leads.

Hosts: no action. `BoardKeyCommand` gains a `frame` command; hosts that switch exhaustively over command types add a case.
