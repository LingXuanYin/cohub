---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": minor
---

The CLI now powers the Cohub desktop apps for macOS and Windows, sharing one sign-in and one set of local Runtimes with the terminal.

- `cohub host serve` answers a desktop host's account and Runtime bridge methods over stdio, one JSON message per line. It starts in about 100 ms, pushes `auth.changed` and `runtime.changed` as the session file and Runtimes change, and restores folders a desktop connected and never disconnected.
- A running Runtime streams its status to local watchers, so nothing polls it; `runtime down` from any client stops restoring that folder.
- `cohub auth token` prints a valid access token, refreshing it under the shared lock.
- `@neta-art/cohub/host-bridge` exports the protocol schemas a host needs, and the protocol adds the `macos` and `windows` platforms, `runtime.pickFolder` (`runtime.picker`) and `notifications.show`.
