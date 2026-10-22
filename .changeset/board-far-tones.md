---
"@neta-art/cohub": minor
---

Zoomed far out, Board pictures keep their color: images, video stills, task previews, file covers and model stills draw in their average color instead of a neutral plate once they have loaded. The color is read while the browser is idle and kept after the texture is released. Asset managers add `getTone` and the `readTone` option, `subscribe` listeners receive the change kind (`"texture"` or `"tone"`), and render contexts offer `assetTone`.

Hosts: no action. Custom renderers can fill far plates with `farPictureTone(item, context)`.
