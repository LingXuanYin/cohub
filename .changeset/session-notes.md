---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": minor
---

Sessions can record notes: messages that get no AI reply but stay in the conversation context for later turns.

- `space.prompt({ mode: "note", content })` records a note immediately and returns its completed turn; notes cannot be scheduled.
- `SessionTurnExecutionKind` adds `note`, and `isAgentTurn()` tells agent turns apart from notes and direct generations.
- `cohub prompt --note "message"` records a note from the CLI.
