# NETA World

A creative App built with the public Cohub Board SDK. Cards and source relations
are native items; a worker script draws the companion using temporary shapes.
The App manages the entire Board without an enclosing Frame.

## Develop

```sh
cd cohub-apps/neta-world
npm ci
npm run i18n
npm run dev
npm run check
```

Requires Node.js 24+ and the SDK with explicit script hit targets, host events and
`placeBoardOverlay` (`baedc391`). Until those APIs reach npm, build the SDK in the
main checkout and substitute its output locally:

```sh
pnpm --filter @neta-art/cohub build
node scripts/use-local-sdk.mjs /workspace/packages/sdk
```

The substitution only changes ignored `node_modules`; `npm ci` restores the
published package. Source imports always use the public SDK.

## Behavior

- Select and drag cards; Shift adds to selection, Space pans, F fits the world.
- Drag the companion onto a card to explore ideas. Use the World list for mobile
  multi-selection. Recommendations and local compositions use labeled templates.
- Accept ideas or combine cards in one undoable patch. Original cards, complete
  text, prompts and source snapshots are preserved. Full content remains editable.
- Cohub AI requests viewer consent and uses `space.streamCompletion`.
- Drafts persist in localStorage; unsubmitted forms survive refresh in the same
  tab. Revision checks detect stale drafts from other tabs. Failed storage writes
  leave the in-memory document available for export.
- Import validates first, keeps the original input and backs up the current Board.
  Imported scripts are preserved but paused. JSON export retains asset references;
  it is not an asset archive.
- Save to Space creates a new Board snapshot with bundled assets. It never
  overwrites an existing collaborative Board. This version has no live remote sync.

Saved Boards open as native content in Cohub. The companion's patrol/drop actions,
recommendations and AI UI require this App host. Bundled assets and public media
URLs are supported; unavailable imported Space assets fail explicitly on save.
Artwork comes from the user-provided NETA v6 App, published version 3.

## Publish

```sh
npm run build
cohub apps publish neta-world --dir cohub-apps/neta-world/dist --hide-cohub-bar
```

The target is relative to the Space workspace; include the worktree prefix when
needed. Publish without App scopes. Saving asks for `file.view` / `file.edit`;
AI asks for `session.prompt.readonly`. These calls require a published App runtime.

`npm run check` runs Svelte/TypeScript, lint and the production build. Check card
and companion dragging, mobile composition, undo, refresh recovery and import
before publishing; verify actual consent, AI and Space saves in the live runtime.
