---
"@neta-art/cohub": minor
---

Draw image and video cards as textured fills cut to the card outline instead of masked sprites. Media cards no longer render through stencil masks, so a Board full of images batches its draws and pans and zooms with far less GPU work. Add `fillCardPicture` for renderers that paint media into a card outline.
