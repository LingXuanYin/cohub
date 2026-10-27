# Score editor

A first-party App that opens a `.abc` score file in a Space, edits it with
[`@neta-art/score-editor`](https://www.npmjs.com/package/@neta-art/score-editor), and saves it back to the
same path. It is a static page: `mount()` fills the frame, and the only host API it uses is the Cohub App
SDK.

## What it does

- Declares `.abc` in the page head (`<meta name="cohub:file-handlers">`), so the Space can open score files
  with it and "Open with" can pick it.
- Takes the file from the launch context (`client.app.onLaunch`), names it before the read, follows a
  rename or move, and asks for `file.view` + `file.edit` on the Space before reading it.
- Reads the file the way the host delivers it: inline UTF-8, inline base64 decoded as UTF-8 (fatal on
  invalid bytes), a `url` delivery fetched as text, and a preparing file retried after its own
  `retryAfterMs` without a deadline of its own.
- Opens read-only (`editable: false`, no save source) when the grant carries only `file.view`, and says why
  with an **Ask for edit access** action.
- Saves the score text with the `{ mtimeMs, size }` version it opened; a `409 file_conflict` becomes the
  package's conflict strip with **Overwrite with my version** and **Load the other version**, never an
  automatic overwrite.
- Keeps the editor mounted with its unsaved edits when a later failure (revoked grant, file gone) arrives;
  the edits stay dirty, the close guard holds, and the frame says they are still here. Permission failures
  offer **Ask for access**, which re-asks with the missing scopes; if the answer still lacks `file.edit`, the
  kept-edits line keeps asking for edit access. A deleted file with kept edits offers **Save as a new file**,
  which recreates the same path without a version, and shows the conflict choices if the file came back.
- Follows the host's locale (`zh*` → Chinese, everything else English) and maps the host appearance tokens
  onto the editor's `--sce-*` variables. The frame uses only host tokens, so light and dark follow the host.
- Paints a neutral skeleton before `context()` answers, and turns a rejected `context()` into the failed
  state with **Try again**.
- Holds the window open only while the score has unsaved changes (`onBeforeClose` → `dirty`).
- Handles the editor's **Regenerate…** review: runs the dialect check and the package's pre-handoff review, saves a
  score file first (a conflict stays the package's), writes a generated score as a `.abc` beside its draft, and puts
  the change summary and that `.abc`'s path on the composer chip without sending anything.
- Says after a handoff to stay in this window and write the request; the chip is only on the composer while this
  App's window is active.

## Handoff

The package's **Regenerate…** button opens its review (the change log, and the pre-handoff notices of newer package
versions) and calls the App only when the score may go. The App then:

- Runs the dialect check and the package's pre-handoff review on that project. A score that does not read, and a
  project the review refuses, hands nothing off: no file, no chip, and a line that names the problem and where it is.
- For a **score file**, the package has already saved the file (a conflict shows its strip and nothing is handed
  off), and the handed-off file is that file. The App writes nothing more.
- For a **generated score**, writes the score to `.cohub/score-drafts/<taskRunId>.abc` in the task's Space, beside
  `.cohub/score-drafts/<taskRunId>.json`; the draft keeper's `handoff()` has recorded its hash by then.
- Puts the composer chip on: the song's title or the file's name as the label (120 characters at most), and the
  package's instruction — final style, joined lyrics, score mode, seed and the change log — under the `.abc` path
  (32 KB at most). The score itself is not in the chip. A second handoff replaces the chip; a refused handoff, a
  renamed or moved file, or another file in the window takes it back.
- Shows a line saying to stay in this window, write what the agent should do, and send. Switching windows drops the
  chip from the composer.

The generated-score launch is not wired here: a launch that carries a task run id should mount the editor with
`onHandoff` calling `createHandoff(...).run({ target: { kind: "generated", taskRunId }, title: songTitle, ... })`;
the score-file launch already does the same with `target: { kind: "scoreFile", path }`.

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
read-only and revoked cases, the locale and theme mapping, the close guard, and the handoff: the `.abc` written for
each score kind, the chip's label and content, a refused handoff that writes and chips nothing, and a second handoff
that replaces the chip. See `harness/README.md` for the state URLs.

## Publish

```bash
cohub apps publish score-editor --dir cohub-apps/score-editor/dist --visibility public
```

No publisher scopes: the App needs viewer grants on the Space it opens, not permissions on its own Space.
The build output is `dist/` with `index.html` and its assets; the harness is not part of it.
