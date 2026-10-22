---
"@neta-art/cohub": minor
---

Boards adapt to the device on their own. Input reaches the screen one frame sooner: every stage update now syncs and renders in the same animation frame. New cards, far plates and text refreshes are paced by measured frame time instead of fixed counts, so fast devices settle in a few frames while slow ones keep their frame rate. Multisampling turns off at 3× density.

`mountBoardStage` and `createBoardAssetManager` now default `lod`, `prefetch`, `concurrency` and `lruBudget` to `defaultBoardDeviceBudget()`: phones and devices reporting little memory get the compact budget, devices reporting plenty of memory and cores a larger cooling pool and more parallel loads, and a resting camera warms pictures just beyond the view unless Save-Data is on or the connection is slow. Pass `prefetch: 0`, or the previous `lod`, `lruBudget` and `concurrency`, to keep the old behavior. `boardDeviceBudget` and `readBoardDeviceSignals` expose the tiers, asset managers gain an optional `prefetch`, and stage `stats()` adds `loading`, `prefetching`, `waiting`, `settling`, `frame` and `interval`.
