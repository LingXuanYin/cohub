---
"@neta-art/cohub": minor
---

Board scripts take input directly in the editor, with no separate interaction mode. Taps on regions that only listen for `click` reach the script while drags move the item; regions listening for pointer events take the whole gesture; modifiers, other tools and selection handles always go to the editor. `resetScripts(id)` restarts one instance.

Hosts: replace `setScriptMode("interact" | "edit")` with nothing and `setScriptMode("paused")` with `setScriptsPaused(true)`.
