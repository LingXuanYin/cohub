---
"@neta-art/cohub": major
---

Stop rendering Board playback once its position settles. A shared playback that finished on `end: "hold"` or waits at a pause marker keeps its `playing` status but no longer drives frames, so opening a Board that was played once stays idle. Replace `playbackTimeAt` with `playbackClockAt`, which returns `{ time, advancing }`.
