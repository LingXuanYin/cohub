---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": patch
---

Board text wraps where the browser wraps it. Chinese, Japanese and Korean text no longer breaks early after a dash or overflows its selection box, punctuation such as `，` and `。` never starts a line, and long URLs break instead of running past their box. The canvas, the in-place editor and `cohub boards export` lay text out once, with the same lines, so editing no longer shifts text or shows it twice, and typing animations reveal text without reflowing. Shape labels align to their padding when left- or right-aligned.

SDK: `setBoardTextLayouter` replaces `setBoardTextMeasurer`, taking a whole text and returning its lines. `board/render` adds `layoutTextLines`, `boardTextStyle` and `onBoardTextFontsChange`; `board` adds `layoutShapeLabel`; the editor adds `relayoutText()`. `syncTextWrapWidth` is removed.
