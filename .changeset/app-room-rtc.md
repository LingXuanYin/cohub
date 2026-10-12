---
"@neta-art/cohub": minor
---

**App room peer channels and device access**: `room.rtc()` adds a WebRTC connection to a realtime room — named data channels (`reliable` or `latest` delivery) and media tracks, relayed between viewers and never through Cohub's servers, for traffic that room events cannot carry. `client.app.devices.request()` asks the viewer for the camera or microphone an App declares with `<meta name="cohub:devices">`, so one App's grant is never reused by another in the shared frame origin.
