---
"@neta-art/cohub": patch
"@neta-art/cohub-cli": minor
---

Expose typed cloud sandbox startup reports through `space(id).sandbox.get()` and add `cohub spaces setup [id]` to inspect startup status, script results, and log paths. Cloud sandboxes run user, mod, and Space `.agents/setup.sh` scripts after workspace bootstrap; local Spaces never run them automatically.
