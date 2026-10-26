---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": patch
---

Displays say which platform they run (`DisplayInfo.platform`: `macos`, `windows`, `linux` or `android`) and whether they report the keyboard focus (`DisplayInfo.focus`). A `DisplayConnection` that controls such a display tracks the focused text field in `connection.focus` and emits `focus` when it changes: its bounds in display units and whether it takes a password, or `null` when no text field has the focus. `cohub spaces displays ls` shows the platform.
