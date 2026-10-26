# Dev-only harness

Renders the App frame for every state on one fake cohub client, so the states can be looked at
without a published App. It is not part of `dist/`: `pnpm build` builds the App's `index.html` only.

```bash
pnpm --filter @cohub/score-editor harness   # http://localhost:5181
```

Every state takes `?state=` and `?lang=en|zh` and `?theme=light|dark`:

- `?state=loading`
- `?state=editable` (the default)
- `?state=readonly`
- `?state=no-permission`
- `?state=revoked`
- `?state=file-gone`
- `?state=failed`
- `?state=no-file`
- `?state=conflict` — open, edit, then press Save; the fake client answers 409
- `?state=save-failed` — open, edit, then press Save; the fake client answers 500

The fake client is `tests/fake-client.ts`, the same one the seam-8 tests drive.
