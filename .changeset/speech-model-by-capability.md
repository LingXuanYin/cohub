---
"@neta-art/cohub": patch
"@neta-art/cohub-cli": patch
---

Ember and the cohub-generate skill pick the speech model from the catalog by capability instead of a fixed id. With Generation SDK 0.2.8, the speech models are `qwen-audio-3.1-tts-flash` (Qwen TTS, now with `instructions` and `seed`) and `scene3` (inline `[bracketed]` delivery cues, `<|speaker:N|>` dialogue, cloning from up to 16 references, optional `drama_value`, `seed` and `instructions`). The older Qwen speech ids are retired with no alias, so declarations must name `qwen-audio-3.1-tts-flash`.
