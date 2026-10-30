import type { SpaceRole } from "@cohub/db";
import { Hono } from "hono";
import { authzDenied, requireValidId, useAuth } from "../../lib/middleware.js";
import { hasPermission } from "../../permissions.js";
import {
  createSpaceInvitation,
  DEFAULT_INVITATION_TTL_SECONDS,
  getInvitationSpaceLocation,
  InvalidInvitationListQueryError,
  listSpaceInvitations,
  MAX_INVITATION_TTL_SECONDS,
  MAX_INVITATION_USES,
  revokeSpaceInvitation,
  serializeInvitation,
  SPACE_INVITATION_ROLES,
} from "../../space-invitations.js";

const router = new Hono();

router.post("/", async (c) => {
  const user = useAuth(c);
  if (user instanceof Response) return user;
  const spaceId = c.req.param("id");
  if (!spaceId || !requireValidId(spaceId)) return c.json({ message: "space not found" }, 404);
  if (!(await hasPermission(user, "member.manage", { spaceId }))) return authzDenied(c);

  const body = await c.req.json<{
    role?: SpaceRole;
    ttlSeconds?: number | null;
    maxUses?: number;
  }>().catch(() => null);

  const role = body?.role ?? "builder";
  if (!SPACE_INVITATION_ROLES.includes(role)) return c.json({ message: "invalid role" }, 400);

  const ttlSeconds = body?.ttlSeconds === undefined ? DEFAULT_INVITATION_TTL_SECONDS : body.ttlSeconds;
  if (ttlSeconds === null) {
    if (role === "host") return c.json({ message: "host invitations must expire within 30 days" }, 400);
  } else if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_INVITATION_TTL_SECONDS) {
    return c.json({ message: "ttlSeconds must be between 1 and 30 days, or null to never expire" }, 400);
  }

  const maxUses = body?.maxUses ?? 0;
  if (!Number.isInteger(maxUses) || maxUses < 0 || maxUses > MAX_INVITATION_USES) {
    return c.json({ message: `maxUses must be between 0 and ${MAX_INVITATION_USES}` }, 400);
  }

  const location = await getInvitationSpaceLocation(spaceId);
  if (!location) return c.json({ message: "space not found" }, 404);

  const invitation = await createSpaceInvitation({
    spaceId,
    role,
    createdBy: user.uuid,
    maxUses,
    expiresAt: ttlSeconds === null ? null : new Date(Date.now() + ttlSeconds * 1000),
  });

  return c.json({
    ...serializeInvitation(invitation),
    spaceId: location.spaceId,
    spaceSlug: location.spaceSlug,
    ownerUsername: location.ownerUsername,
  }, 201);
});

router.get("/", async (c) => {
  const user = useAuth(c);
  if (user instanceof Response) return user;
  const spaceId = c.req.param("id");
  if (!spaceId || !requireValidId(spaceId)) return c.json({ message: "space not found" }, 404);
  if (!(await hasPermission(user, "member.manage", { spaceId }))) return authzDenied(c);

  const status = c.req.query("status") ?? "all";
  if (status !== "all" && status !== "active") return c.json({ message: "status must be active or all" }, 400);
  const limitParam = c.req.query("limit");
  const limit = limitParam === undefined ? undefined : Number(limitParam);
  if (limit !== undefined && !Number.isInteger(limit)) return c.json({ message: "limit must be an integer" }, 400);

  const location = await getInvitationSpaceLocation(spaceId);
  if (!location) return c.json({ message: "space not found" }, 404);

  try {
    const page = await listSpaceInvitations(spaceId, { status, limit, cursor: c.req.query("cursor") });
    return c.json({
      ...page,
      spaceId: location.spaceId,
      spaceSlug: location.spaceSlug,
      ownerUsername: location.ownerUsername,
    });
  } catch (error) {
    if (error instanceof InvalidInvitationListQueryError) return c.json({ message: error.message }, 400);
    throw error;
  }
});

router.delete("/:token", async (c) => {
  const user = useAuth(c);
  if (user instanceof Response) return user;
  const spaceId = c.req.param("id");
  if (!spaceId || !requireValidId(spaceId)) return c.json({ message: "space not found" }, 404);
  if (!(await hasPermission(user, "member.manage", { spaceId }))) return authzDenied(c);

  const revoked = await revokeSpaceInvitation(spaceId, c.req.param("token"), user.uuid);
  if (!revoked) return c.json({ message: "invitation not found" }, 404);
  return c.json({ ok: true });
});

export default router;
