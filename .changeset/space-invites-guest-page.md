---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": minor
---

Space invites can last forever, and Apps can build their own invite and guest pages.

- Invite links live in the database: `ttlSeconds: null` creates a link that never expires (not for hosts), the 100-link cap is gone, and revoked, used-up, and expired links stay on record; `status` adds `expired`. `invitations.list({ status, limit, cursor })` pages through them; invitations carry `id`, `createdBy`, and `expiresAt`.
- `auth.joinSpace({ invite, scopes?, reason? })` lets an App join the viewer to a Space through one host dialog, optionally authorizing scopes on it. `invite.get()` adds the Space description and avatar, the inviter, the guest page, and the viewer's current role; `invite.accept()` reports `joined` and needs the viewer's own account.
- A Space can set a published public App as its guest page with `updateConfig({ guest: { appId } })`. Visitors without access and invite links open it with `shell.surface: "guest"` and `shell.invite`.
- Managing invites now requires `member.manage` through the regular permission check, so an App session acts only with the viewer's grant.
- CLI: `spaces invites create --never-expires`, `spaces invites ls --all`, and `spaces config --guest-app <app>`; `access set` only changes the options you pass.
