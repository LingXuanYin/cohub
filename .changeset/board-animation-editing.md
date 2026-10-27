---
"@neta-art/cohub": minor
---

The Board editor gains animation editing primitives, each one undo step: `keyProperty`, `keyCamera`, `moveKeyframes`, `removeKeyframes`, `setKeyframe`, `setTrack`, `copyKeyframes`, `pasteKeyframes`, `setMarkers`, `updateAnimation` and `deleteAnimation`. Moving an item at the playhead no longer keys untouched properties through float drift.

Hosts: replace `toggleKeyframe(property)` with `keyProperty(target, property, on)`, `removeKeyframe(trackId, at)` with `removeKeyframes([{ trackId, at }])`, and `setKeyframeEase(trackId, at, ease)` with `setKeyframe({ trackId, at }, { ease })`; `keyframeState` is gone.
