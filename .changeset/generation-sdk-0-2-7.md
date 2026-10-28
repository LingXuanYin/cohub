---
"@neta-art/cohub": patch
"@neta-art/cohub-cli": patch
---

Upgrade Generation SDK to 0.2.7. Its speech models are `qwen-audio-3.1-tts-flash` (Qwen TTS, now with `instructions` and `seed`) and `scene3` (inline `[bracketed]` delivery cues, `<|speaker:N|>` dialogue, cloning from up to 16 references, optional `drama_value`, `seed` and `instructions`). The older Qwen speech ids are retired with no alias, so declarations must name `qwen-audio-3.1-tts-flash`. Ember and the cohub-generate skill pick the speech model from the catalog by capability instead of a fixed id.
