---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": patch
---

Media previews follow one pipeline across hosts. `imageVariantUrl`, `videoFrameUrl` and `mediaPreviewCandidates` now resize Cloudflare-hosted (R2) media as well as OSS, `probeMediaInfo` reads R2 image sizes, and `variantSource` traces either back to its source. `videoFrameUrl(url, size, { fit, natural })` sizes frames like image variants, exactly when the video's size is known; `MediaPreviewSource` takes a recorded `width` and `height` for that. `loadMediaInfo` and `cachedMediaInfo` share probed facts per context.

Boards load video and task covers as sized CDN frames instead of decoding the video, so they share the image pool, sharpen with zoom and shrink when idle; videos elsewhere still decode in the page. `loadVideoPreviews: false` now only skips that decoding. `boardMediaNaturalSize(item)` reads a media item's recorded size. CLI exports use the same frames.
