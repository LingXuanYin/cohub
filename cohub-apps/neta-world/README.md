# NETA World

A creative App using the public Cohub Board SDK. Native cards, creation notes and
relations share one editor across authoring and role-play. No enclosing world
Frame or SDK changes are needed.

## Develop

```sh
cd cohub-apps/neta-world
npm ci
npm run i18n
npm run dev
npm run check
```

Requires Node.js 24+ and the SDK with explicit script input, host events and
`placeBoardOverlay`. Until the updated package is published, substitute a local
SDK build in ignored `node_modules`:

```sh
pnpm --filter @neta-art/cohub build
node scripts/use-local-sdk.mjs /workspace/packages/sdk
```

## Behavior

- Select cards without opening recommendations; Explore is an explicit action.
- Create ideas or compositions with source records and undoable creation notes.
- Enter the bundled midnight conversation, follow crypt or bell-tower routes,
  and return discoveries to the same Board. Refresh resumes the run; replay uses
  stable entity IDs and receipts to avoid duplicates. Restart archives history.
- AI requires viewer consent. Original prompts/responses are kept; AI replies do
  not create unvalidated discovery events.
- The final scene card stores a scene definition. Panorama and multiplayer are
  not implemented. Artwork comes from the supplied NETA v6/v37 Apps.
- Mobile switches between dialogue and Board without creating another canvas.

## Data

Local drafts detect stale tabs; import preserves its input and backs up the Board.
Imported scripts are paused. Unsubmitted inputs survive refresh in the same tab.
JSON export preserves media references, not an archive of their files.

Save to Space creates a new asset-complete snapshot. Connect can create or open a
remote Board using the SDK Replica. Server snapshots and ordered pending writes
are stored separately, isolated by viewer/Space/Board. Disconnect returns to the
local draft without deleting the outbox. Run transcripts remain local per viewer
and Board, not shared room history. LocalStorage checks are not atomic locks.

## Motion

Existing Stage previews/overlays and scoped Web Animations provide card births,
pixel image reveals, source highlights, candidate decoding, discovery flights and
dialogue transitions. Effects never write history or block input. Board effects
are capped at 30 fps, eight cards, six sources and 48 particles; they stop when
settled, interrupted, hidden or disposed. Reduced motion is respected.

## Publish and verify

```sh
npm run build
cohub apps publish neta-world --dir cohub-apps/neta-world/dist --hide-cohub-bar
```

Publish with no App scopes. Saving/sync asks for `file.view`/`file.edit`; AI asks
for `session.prompt.readonly`. Actual authorization, billing and remote sync need
validation in a published runtime.

`npm run check` runs typecheck, lint, two data-safety tests and the production
build. Browser-check selection, companion dragging, replay, refresh recovery,
undo, mobile switching and motion interruption before publishing. The retained
tests cover offline operation order and viewer/Board cache isolation.
