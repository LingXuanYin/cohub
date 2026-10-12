# Shared App Infrastructure

Authorization, resource caching, draft protection, theme and build defaults for four independent Apps:

| App | Read scopes | Write scopes |
| --- | --- | --- |
| `task-inspector` | `taskrun.view` | None |
| `checkpoint-explorer` | `checkpoint.view` | `checkpoint.edit` |
| `schedule-manager` | `cronjob.view`, `taskrun.view` for runs | `cronjob.manage`, `session.prompt.fullaccess` for creation |
| `app-manager` | `space.view` | `app.manage` |

Each App owns its entry, view and `dist/`. Each category uses one workspace Tab; resource IDs are launch state, not file paths. This shared package is private and is not published as an App.

## Development

```bash
pnpm --filter @cohub/protocol build
pnpm --filter @cohub/task-inspector dev
pnpm --filter "./cohub-apps/*" --if-present typecheck
pnpm --filter @cohub/app-shared test
```

Use each App's package name for `dev`, `build`, `typecheck` and `lint`. Scripts compile the Web Paraglide catalog from `apps/web/messages/`. Theme and locale follow the host. Set `VITE_COHUB_ENV=dev` for the development API; production is the default.

## Publish and enable

Build each App, then publish from the official Space with no publisher scopes:

```bash
cohub apps publish task-inspector --dir cohub-apps/task-inspector/dist --visibility public
cohub apps publish checkpoint-explorer --dir cohub-apps/checkpoint-explorer/dist --visibility public
cohub apps publish schedule-manager --dir cohub-apps/schedule-manager/dist --visibility public
cohub apps publish app-manager --dir cohub-apps/app-manager/dist --visibility public
```

Apps request viewer grants on the target Space; public App code does not grant access to resource data. Existing server permissions and ownership checks remain authoritative.

After checking the published Apps, set Web's `PUBLIC_RESOURCE_APPS_PREFIX` to the official `username/spaceSlug`. Leave it empty to retain native pages. Removing it rolls back navigation without changing resources or grants. Old resource URLs remain valid; `?native=1` opens the original page. Specialized actions such as promotions and Checkpoint forks remain available through **More actions**.

## State

Successful server responses use a five-minute session cache, isolated by viewer, App, Space and resource. Permission failures clear cached details. Drafts use separate persistent storage; failed draft writes prevent a successful close acknowledgement. Task polling pauses while hidden. Snapshot files always use the read-only checkpoint API.

Validate real host/builder/guest permissions, grant revocation, cross-Space access, draft recovery and mobile navigation before enabling the published Apps.
