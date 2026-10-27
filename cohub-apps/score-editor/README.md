# Score editor

A first-party App that opens a score in a Space with
[`@neta-art/score-editor`](https://www.npmjs.com/package/@neta-art/score-editor). It opens two things: a
`.abc` score file, saved back to the same path; or one generation, read from its Task Run and edited into a
draft. It is a static page: `mount()` fills the frame, and the only host API it uses is the Cohub App SDK.

## What it does

- Opens a generation when the launch URL carries `?taskRun=<taskRunId>` and the invocation names the Space;
  a file alone opens as a score file (07), and both together open the generation, with the file only as the
  place Save as goes beside.
- Asks for `file.view`, `file.edit` and `taskrun.view` before reading a generation, calls `tasks.get`, and
  builds the song project: style from the `prompt` role, lyrics from `lyrics`, the score from the output's
  `abc` role (or the input's when the output has none), the seed and score mode from the request parameters.
  Missing fields stay empty for the Project panel to fill; `style` and `lyrics` are the required inputs.
- Keeps a generated score's edits in a draft at `.cohub/score-drafts/<taskRunId>.json` in the task's Space,
  through the package's `DraftStore`, with the `{mtimeMs, size}` file version; a `409 file_conflict` is the
  package's conflict strip. List and read feed the package's inheritance from a handed-off draft; Restore
  original comes from the package's keeper and never rewrites the generation.
- Opens read-only without `file.edit`: no draft is read, written or listed, no Save as exists, and the
  original shows with a line saying why.
- Saves a generated score as a new score file and reopens it: beside the source file as `<name>-copy.abc`,
  or in `scores/<taskRunId>.abc`; a taken name gets `-2`, `-3`, … and an existing file is never overwritten.
- Passes `source: { kind: "generated" }` and the project's source key, so the package's source label and
  Restore original work.
- Declares `.abc` in the page head (`<meta name="cohub:file-handlers">`), so the Space can open score files
  with it and "Open with" can pick it.
- Takes the file from the launch context (`client.app.onLaunch`), names it before the read, follows a
  rename or move, and asks for `file.view` + `file.edit` on the Space before reading it.
- Reads the file the way the host delivers it: inline UTF-8, inline base64 decoded as UTF-8 (fatal on
  invalid bytes), a `url` delivery fetched as text, and a preparing file retried after its own
  `retryAfterMs` without a deadline of its own.
- Opens read-only (`editable: false`, no save source) when the grant carries only `file.view`, and says why
  with an **Ask for edit access** action.
- Saves a score file's text with the `{ mtimeMs, size }` version it opened; a `409 file_conflict` becomes
  the package's conflict strip with **Overwrite with my version** and **Load the other version**, never an
  automatic overwrite.
- Names the file in the frame in every state; while the editor is shown its own toolbar carries the source
  label, so the frame keeps only the file name and folder there.
- Keeps the editor mounted with its unsaved edits when a later failure (revoked grant, file gone) arrives;
  the edits stay dirty, the close guard holds, and the frame names the cause and what Save does. Permission
  failures offer **Ask for access**, which re-asks with the missing scopes; a grant says access is back, a
  view-only grant says who must grant edit access, and a declined one adds that access was not given. A
  deleted file is told from a changed one at the adapter: cohub answers a versioned write with
  `409 file_conflict` even when the path is gone, so the adapter reads the path — a `404 path_not_found`
  means deleted; the frame names it and the next **Save again** creates the same path with the kept text. No
  frame button is involved. The conflict dialog still works on a deleted file: use my version creates it,
  load the other version keeps the edits and the line. A returning file clears the line so only the conflict
  banner remains.
- A retry never reloads while edits are unsaved; the failed-read line asks for Save again instead.
- Read-only mounts show **Score file (read only)** (the package would call a source-less mount a generated
  score), and a file at the Space root shows "Space root" in the folder line.
- Follows the host's locale (`zh*` → Chinese, everything else English) and maps the host appearance tokens
  onto the editor's `--sce-*` variables. The frame uses only host tokens, so light and dark follow the host.
- Paints a neutral skeleton before `context()` answers, and turns a rejected `context()` into the failed
  state with **Try again**.
- Holds the window open only while the score has unsaved changes (`onBeforeClose` → `dirty`).

## Develop

```bash
pnpm --filter @cohub/score-editor build
pnpm --filter @cohub/score-editor typecheck
pnpm --filter @cohub/score-editor lint
pnpm --filter @cohub/score-editor test
pnpm --filter @cohub/score-editor harness   # fake-client states on http://localhost:5181
```

The seam-8 tests drive the real editor session and keeper over a fake cohub client
(`tests/fake-client.ts`); they assert the path, text and version of every write, both conflict choices, the
read-only and revoked cases, the locale and theme mapping, and the close guard. The generated-score tests add
the Task Run field mapping, the draft store's create, update, conflict and list, inheritance from a
handed-off draft, Restore original, and the Save as names and locations. See `harness/README.md` for
the state URLs.

## Publish

```bash
cohub apps publish score-editor --dir cohub-apps/score-editor/dist --visibility public
```

No publisher scopes: the App needs viewer grants on the Space it opens, not permissions on its own Space.
The build output is `dist/` with `index.html` and its assets; the harness is not part of it.
