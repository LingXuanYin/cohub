---
"@neta-art/cohub": patch
"@neta-art/cohub-cli": patch
---

Upgrade Generation SDK to 0.1.44. The speech adapter accepts `scene3`, a text-to-speech model with inline `[bracketed]` delivery cues, `<|speaker:N|>` dialogue and cloning from up to 16 references, with optional `drama_value`, `seed` and `instructions` parameters, once a declaration lists it. The SDK no longer ships `higgs-tts` (removed in 0.1.42).
