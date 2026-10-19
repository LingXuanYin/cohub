---
"@neta-art/cohub-cli": patch
---

Lower the default sandbox idle TTL to 1 hour in production and 5 minutes in development, previously 12 hours and 10 minutes. The API default Space policy, the CLI `spaces create` default and the settings page all read `getDefaultSandboxIdleTtl`, so the value lives in one place. Spaces that already store an auto-destroy policy keep their TTL.
