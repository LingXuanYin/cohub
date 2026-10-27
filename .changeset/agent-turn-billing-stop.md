---
"@neta-art/cohub": patch
"@neta-art/cohub-cli": patch
---

An Agent Turn whose payer runs out of balance mid-run now stops before its next LLM round instead of running to the end. The Turn ends interrupted with `summary.reason` `billing` and `summary.billing` carrying the balance gate's conversion payload. `cohub spaces sessions ls` shows such Sessions as `stopped: insufficient balance`, and `cohub spaces sessions turns get` explains the stop.
