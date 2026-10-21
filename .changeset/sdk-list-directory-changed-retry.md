---
"@neta-art/cohub": patch
---

`files.list()` without page options now restarts the listing when the server answers 409 `directory_changed` (up to three times, backing off 100 / 250 / 500 ms), so a directory written to while it is being listed no longer fails the read. Single-page listings (`{ pagination: true, cursor }`) still surface the error, since the caller owns the cursor.

`files.list()` 不传分页参数时，遇到服务端 409 `directory_changed` 会重新列目录（最多 3 次，退避 100 / 250 / 500 ms），列目录期间有写入不再导致读取失败。单页调用（`{ pagination: true, cursor }`）仍把错误交给持有 cursor 的调用方处理。
