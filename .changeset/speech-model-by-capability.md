---
"@neta-art/cohub": patch
"@neta-art/cohub-cli": patch
---

Ember and the cohub-generate skill pick the speech model from the catalog by capability instead of a fixed id, so they keep working when a speech model leaves the catalog. The skill also shows how to pass a speech model's `instructions` parameter. Generation SDK 0.2.10: scene3 no longer takes `instructions` and states its 900-character text limit; `qwen-audio-3.1-tts-flash` gets more accurate descriptions of `instructions` and `seed`.
