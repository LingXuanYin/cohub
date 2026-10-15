---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": minor
---

Add live hosted Room connections with bidirectional NDJSON CLI commands, member synchronization, and retained-event replay. Add participant-scoped RTC authorization and a pluggable PeerConnection factory. The CLI supports isolated, opt-in RTC media/data workers with PCM/I420 or Opus/VP8 file or pipe inputs and bounded binary or segmented-file outputs. RTC runs in an on-demand Go/Pion helper (`cohub-rtc`) that the CLI downloads and verifies; FFmpeg is needed only for format conversion.
