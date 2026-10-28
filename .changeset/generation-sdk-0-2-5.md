---
"@neta-art/cohub": patch
"@neta-art/cohub-cli": patch
---

Upgrade Generation SDK to 0.2.5. The SDK's speech models are now `qwen-audio-3.1-tts-flash` and `scene3`; `qwen-audio-3.0-tts-flash`, `qwen-audio-3.0-tts-plus` and `qwen-tts` are no longer in it, so declarations must not name them. `scene3` takes inline `[bracketed]` delivery cues, `<|speaker:N|>` dialogue and cloning from up to 16 references, with optional `drama_value`, `seed` and `instructions` parameters, once a declaration lists it. Seedance declarations require `duration`.
