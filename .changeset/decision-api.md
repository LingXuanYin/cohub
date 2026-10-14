---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": minor
---

Add decision model calls. `space.decision()` answers `noul` (yes/no), `choice`, and `score` questions about text, a JSON object, or images with calibrated probabilities, through `POST /api/spaces/:id/decisions`. Images can be https or data URLs. The CLI adds `cohub decision` and `cohub spaces decision`, which read questions from inline JSON or a file and upload local `--image` files as WebP first.

新增决策模型调用。`space.decision()` 通过 `POST /api/spaces/:id/decisions`，针对文本、JSON 对象或图片回答 `noul`（肯定或否定）、`choice`（单选）和 `score`（打分）问题，并给出校准过的概率。图片可以是 https URL 或 data URL。CLI 新增 `cohub decision` 和 `cohub spaces decision`，问题可以写成内联 JSON 或放在文件里，本地 `--image` 图片会先转成 WebP 并上传。
