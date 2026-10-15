---
"@neta-art/cohub": patch
"@neta-art/cohub-cli": patch
---

Raise the single-file upload limit from 1 GiB to 2 GiB. Upload rejections now carry a structured `code` — `file_too_large`, `upload_batch_too_large`, `upload_too_many_files`, or `upload_rate_limited` with `retryAfterSeconds` — exported from the SDK as `UPLOAD_ERROR_*` constants, alongside `batchUploadEntries` for splitting large uploads under the batch caps.
