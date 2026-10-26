---
"@neta-art/cohub": patch
"@neta-art/cohub-cli": patch
---

Upgrade Generation SDK to 0.1.41. Song 2 takes lyrics up to 4000 characters with no length cap on the style prompt or the score, waits until the server ends the task instead of giving up after 21 minutes, and accepts the optional `abc_continue`, `harmony` and `lyric_schedule` parameters.
