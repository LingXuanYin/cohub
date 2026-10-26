# Dev-only harness

Renders the App frame for every state on one fake cohub client, so the states can be looked at
without a published App. It is not part of `dist/`: `pnpm build` builds the App's `index.html` only.

```bash
pnpm --filter @cohub/score-editor harness   # http://localhost:5181
```

Every state takes `?state=`, `?lang=en|zh` and `?theme=light|dark`:

- `?state=loading`
- `?state=editable` (the default)
- `?state=readonly`
- `?state=readonly-retry` — read-only; **Ask for edit access** grants it and reopens editable
- `?state=no-permission`
- `?state=no-permission-retry` — open declined; **Ask for access** grants it and opens the file
- `?state=no-permission-declined` — both consents declined; the frame says access was not given
- `?state=revoked` — revoked before the first read
- `?state=revoked-save` — open, edit, then Save; the write answers 403, **Ask for access** grants it and
  **Save again** writes the kept edits
- `?state=revoked-viewonly` — as above, but the viewer now holds only `file.view`; the kept-edits line keeps
  asking for edit access
- `?state=file-gone`
- `?state=gone-save` — open, edit, then Save; the file is gone, the edits stay and **Save as a new file**
  recreates the path
- `?state=gone-returned` — as `gone-save`, but the file comes back meanwhile; the action shows the package's
  conflict choices instead of writing
- `?state=failed`
- `?state=conflict` — edit, then Save; the fake client answers 409
- `?state=save-failed` — edit, then Save; the fake client answers 500
- `?state=no-file` — the App opened without a file
- `?state=no-host` — not inside a Space
- `?state=startup-failed` — `context()` rejected; **Try again** re-boots

Paths: `?path=root` (no folder line), `?path=deep` (middle-truncated folder), `?path=long` (80-character
name); the default is `scores/intro.abc`.

The fake client is `tests/fake-client.ts`, the same one the seam-8 tests drive. The host tokens in
`harness/main.ts` use cohub's brand `#FF3E00` so the shots match the host.
