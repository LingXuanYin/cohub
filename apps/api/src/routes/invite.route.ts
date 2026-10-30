import { spaces, userProfiles, type SpaceRole } from "@cohub/db";
import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { db } from "../db/index.js";
import { getOptionalAccountAuth, getSpacePublicProfile, useAccountPrincipal } from "../lib/middleware.js";
import { getSpaceMemberRole } from "../permissions.js";
import { dispatchSpaceListChanged } from "../space-list-events.js";
import { resolveSpaceGuestAppId } from "../space-guest.js";
import {
  findSpaceInvitation,
  getInvitationStatus,
  redeemSpaceInvitation,
  serializeInvitation,
  type InvitationRedemption,
} from "../space-invitations.js";
import { fallbackPublicUserProfile, getProfilesByUuids } from "../user-profiles.js";

const router = new Hono();

const UNAVAILABLE: Record<Exclude<InvitationRedemption["status"], "joined" | "member">, { code: string; message: string }> = {
  missing: { code: "invitation_not_found", message: "invitation expired or not found" },
  expired: { code: "invitation_expired", message: "invitation expired or not found" },
  revoked: { code: "invitation_revoked", message: "invitation has been revoked" },
  exhausted: { code: "invitation_exhausted", message: "invitation has reached its usage limit" },
};

const unavailable = (c: Context, status: keyof typeof UNAVAILABLE) => c.json(UNAVAILABLE[status], 410);
const spaceGone = (c: Context) =>
  c.json({ code: "invitation_space_missing", message: "invitation space no longer exists" }, 410);

async function loadInvitationSpace(spaceId: string) {
  const [space] = await db
    .select({ space: spaces, ownerUsername: userProfiles.username })
    .from(spaces)
    .leftJoin(userProfiles, eq(userProfiles.userUuid, spaces.userUuid))
    .where(eq(spaces.id, spaceId))
    .limit(1);
  return space ?? null;
}

const location = (space: typeof spaces.$inferSelect, ownerUsername: string | null) => ({
  spaceId: space.id,
  spaceName: space.name,
  spaceSlug: space.slug,
  ownerUsername,
});

router.get("/:token", async (c) => {
  const invitation = await findSpaceInvitation(c.req.param("token"));
  if (!invitation) return unavailable(c, "missing");
  const status = getInvitationStatus(invitation);
  if (status !== "active") return unavailable(c, status);

  const viewer = getOptionalAccountAuth(c);
  const [loaded, profiles, viewerRole] = await Promise.all([
    loadInvitationSpace(invitation.spaceId),
    getProfilesByUuids([invitation.createdBy]),
    viewer ? getSpaceMemberRole(invitation.spaceId, viewer.uuid) : null,
  ]);
  if (!loaded) return spaceGone(c);

  const { id, token, role, expiresAt, expiresInSeconds } = serializeInvitation(invitation);
  return c.json({
    id,
    token,
    role,
    expiresAt,
    expiresInSeconds,
    ...location(loaded.space, loaded.ownerUsername),
    spaceDescription: loaded.space.description,
    spaceAvatarUrl: getSpacePublicProfile(loaded.space).avatarUrl,
    inviter: profiles.get(invitation.createdBy) ?? fallbackPublicUserProfile(invitation.createdBy),
    guestAppId: await resolveSpaceGuestAppId(loaded.space),
    viewerRole,
  });
});

router.post("/:token/accept", async (c) => {
  const user = useAccountPrincipal(c);
  if (user instanceof Response) return user;

  const invitation = await findSpaceInvitation(c.req.param("token"));
  if (!invitation) return unavailable(c, "missing");
  const loaded = await loadInvitationSpace(invitation.spaceId);
  if (!loaded) return spaceGone(c);

  const redemption = await redeemSpaceInvitation(invitation, user.uuid);
  if (redemption.status !== "joined" && redemption.status !== "member") {
    return unavailable(c, redemption.status);
  }

  const joined = redemption.status === "joined";
  if (joined) await dispatchSpaceListChanged(loaded.space.id, [user.uuid]);
  return c.json({
    ok: true as const,
    joined,
    ...location(loaded.space, loaded.ownerUsername),
    role: redemption.role satisfies SpaceRole,
  });
});

export default router;
