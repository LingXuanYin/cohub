---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": patch
---

Media previews follow one pipeline across hosts. `imageVariantUrl`, `videoFrameUrl` and `mediaPreviewCandidates` now resize Cloudflare-hosted (R2) media as well as OSS, `probeMediaInfo` reads R2 image sizes, and `variantSource` traces either back to its source. `videoFrameUrl(url, size, { fit, natural })` sizes frames like image variants, exactly when the video's size is known; `MediaPreviewSource` takes a recorded `width` and `height` for that. `loadMediaInfo` and `cachedMediaInfo` share probed facts per context.

Boards load video and task covers as sized CDN frames instead of decoding the video, so they share the image pool, sharpen with zoom and shrink when idle; videos elsewhere still decode in the page. `loadVideoPreviews: false` now only skips that decoding. `boardMediaNaturalSize(item)` reads a media item's recorded size. CLI exports use the same frames.

Video frames on OSS hosts, which cannot fit a frame into a box, size themselves from what is known: `BoardAssetRef.natural` lets hosts pass a video's pixel size, Boards learn each video's aspect from its first frame, and a frame that cannot sharpen without the size probes it instead of staying soft. On hosts with media metadata, the first frame waits briefly for one HEAD to be sized exactly. `videoFrameUrl` takes an `aspect`, and `fitsVideoFrames(url)` tells hosts that fit frames themselves. `loadMediaSize(url, type)` probes a size once per context.

`probeVideoFrameSize` reads a JPEG frame header and stops once it has it, and no longer reports Cloudflare's scaled default frames as the video's size, which Board size settling could persist.
