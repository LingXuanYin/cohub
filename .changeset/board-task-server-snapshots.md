---
"@neta-art/cohub": minor
---

Board task items are kept current by the server: write only `props.taskRunId`, and every Board in the Space that shows the run receives its final snapshot when it finishes. Task cards draw a live generating state with elapsed time, prompt and failure reasons, and fit their result's aspect ratio. Add `createTaskResultItems`, media `origin`, and `boards` on task details. `editor.applyTaskSnapshots` is removed; the server is the only writer of task snapshots.
