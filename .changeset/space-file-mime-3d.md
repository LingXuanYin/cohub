---
"@neta-art/cohub": patch
"@neta-art/cohub-cli": patch
---

Name files with one shared MIME table, now including 3D models (`.glb`, `.gltf`, `.stl`, `.obj`, `.3mf`, `.usdz`). The SDK exports `mimeTypeForPath` and `isTextMime`; `cohub public upload` serves every known type with its proper content type.
