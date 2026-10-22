---
"@neta-art/cohub": minor
---

`layoutTextLines` takes `{ maxLines, whiteSpace }`: it clamps text like `line-clamp`, ending the last line in an ellipsis, collapses white space with `whiteSpace: "normal"`, and reports `truncated`. Ellipses no longer split emoji or other grapheme clusters. `ellipsizeWrappedLines` is removed; use `maxLines`.

Hosts: wrap canvas card text with `layoutTextLines` instead of a separate line breaker.
