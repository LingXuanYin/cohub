---
"@neta-art/cohub": major
"@neta-art/cohub-cli": major
---

Replace the standalone Sketch item with a shared script attachment for Board items and a `custom` content container. Add isolated module instances, native scene effects, Canvas drawing, local input and explicit document commits. Browser and CLI exports share the script runtime and ESM module loading contract.

Existing Sketch documents must move `props.src`, `props.params` and `props.seed` into `script`, change `type` to `custom`, and leave `props` empty. Stored documents are not rewritten automatically.
