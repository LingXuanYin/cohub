---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": minor
---

Prompts can hand work to another Space and get its reply back in the calling Chat.

- An agent prompt starting with a mention of another Space or Chat (from the Web, SDK, CLI or a scheduled prompt) is recorded as a note and sent there without the mention, with the chosen model; a Chat mention continues that Chat, a Space mention starts a new one. The reply arrives as a note.
- `space.prompt({ reply: "note" | "prompt", ... })` sent from a Cohub Turn delivers the final reply back to the calling Chat; `prompt` also runs that Chat's Agent.
- `SessionTurnOriginKind` adds `reply`, `SentTurnRef` adds `reply`, and `readSessionTurnReply()`, `readSessionTurnRelay()` and `readReplyStatus()` read the new metadata.
- `cohub -s <spaceId> spaces prompt --reply "message"` delegates from an Agent and resumes it when the reply arrives.
