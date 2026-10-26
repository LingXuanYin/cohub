# Score editor

A first-party App that opens a `.abc` score file in a Space, edits it with
[`@neta-art/score-editor`](https://www.npmjs.com/package/@neta-art/score-editor), and saves it back to the
same path. It is a static page: `mount()` fills the frame, and the only host API it uses is the Cohub App
SDK.

## What it does

- Declares `.abc` in the page head (`<meta name="cohub:file-handlers">`), so the Space can open score files
  with it and "Open with" can pick it.
- Takes the file from the launch context (`client.app.onLaunch`), follows a rename or move, and asks for
  `file.view` + `file.edit` on the Space before reading it.
- Opens read-only (`editable: false`, no save source) when the grant carries only `file.view`.
- Saves the score text with the `{ mtimeMs, size }` version it opened; a `409 file_conflict` becomes the
  package's conflict strip with **Overwrite with my version** and **Load the other version**, never an
  automatic overwrite.
- Reports a revoked grant, a missing file and a failed read as frame states instead of an editor.
- Follows the host's locale (`zh*` → Chinese, everything else English) and maps the host appearance tokens
  onto the editor's `--sce-*` variables.
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
read-only and revoked cases, the locale and theme mapping, and the close guard. See `harness/README.md` for
the state URLs.

## Publish

```bash
cohub apps publish score-editor --dir cohub-apps/score-editor/dist --visibility public
```

No publisher scopes: the App needs viewer grants on the Space it opens, not permissions on its own Space.
The build output is `dist/` with `index.html` and its assets; the harness is not part of it.
