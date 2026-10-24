---
"@neta-art/cohub": patch
"@neta-art/cohub-cli": patch
---

Public file uploads can store an image or video's size and duration (`MediaFacts`) with the object (`PublicFileUploadEntryInput.media`), so a HEAD answers them on `public.cohub.live` and `works.cohub.live`; `cohub public upload` records them from local files. Chat images record their width and height in `_meta`, so the lightbox reserves their frame. `static.neta.art` and `pages-r2.neta.art` are resized like other Cohub media hosts.

Space files served from the CDN carry their recorded `media` in file responses and object metadata (served by `sessions.cohub.live`), read from the file's header bytes when it is cached to the CDN; `mediaFacts` validates such facts.
