---
"@neta-art/cohub": minor
"@neta-art/cohub-cli": minor
---

Referrals cap rewards at 5 friends per 30-day cycle, starting from the first successful referral. Invitees must finish their first conversation within 72 hours of joining.

- `ReferralStatus` adds `expired` and `capped`.
- `PublicReferral.rewardAvailable` reports whether the inviter has a reward slot left.
- `ReferralDashboard.quota` exposes the current cycle, and `ReferralListItem.expiresAt` exposes each pending claim's deadline.
- `cohub referrals` prints cycle usage, and `cohub referrals ls` adds an Expires column.
