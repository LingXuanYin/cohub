import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accessPolicies } from "@cohub/db";
import { requireValidId, useAuth, authzDenied } from "../../lib/middleware.js";
import { hasPermission } from "../../permissions.js";
import { isEligibleSpaceGuestApp } from "../../space-guest.js";
import type { AccessPolicyRole } from "@cohub/db";

const router = new Hono();
const SIGNED_IN_VALID_ROLES = new Set<AccessPolicyRole>(["builder", "guest", null]);
const ANONYMOUS_VALID_ROLES = new Set<AccessPolicyRole>(["guest", null]);

router.get("/", async (c) => {
  const user = useAuth(c);
  if (user instanceof Response) return user;
  const spaceId = c.req.param("id");
  if (!spaceId || !requireValidId(spaceId)) return c.json({ message: "space not found" }, 404);
  if (!(await hasPermission(user, "member.view", { spaceId }))) return authzDenied(c);

  const [policy] = await db
    .select({
      signed_in_user: accessPolicies.signedInUserRole,
      anonymous_user: accessPolicies.anonymousUserRole,
      guest_app_id: accessPolicies.guestAppId,
    })
    .from(accessPolicies)
    .where(and(eq(accessPolicies.resourceType, "space"), eq(accessPolicies.resourceId, spaceId)))
    .limit(1);

  return c.json({
    signed_in_user: policy?.signed_in_user ?? null,
    anonymous_user: policy?.anonymous_user ?? null,
    guest_app_id: policy?.guest_app_id ?? null,
  });
});

router.patch("/", async (c) => {
  const user = useAuth(c);
  if (user instanceof Response) return user;
  const spaceId = c.req.param("id");
  if (!spaceId || !requireValidId(spaceId)) return c.json({ message: "space not found" }, 404);
  if (!(await hasPermission(user, "member.manage", { spaceId }))) return authzDenied(c);

  const body = await c.req.json<{
    signed_in_user?: AccessPolicyRole;
    anonymous_user?: AccessPolicyRole;
    guest_app_id?: string | null;
  }>().catch(() => null);
  if (!body || (body.signed_in_user === undefined && body.anonymous_user === undefined && body.guest_app_id === undefined)) {
    return c.json({ message: "invalid body" }, 400);
  }
  if (body.signed_in_user !== undefined && !SIGNED_IN_VALID_ROLES.has(body.signed_in_user)) {
    return c.json({ message: "access role must be guest, builder (signed-in only), or null" }, 400);
  }
  if (body.anonymous_user !== undefined && !ANONYMOUS_VALID_ROLES.has(body.anonymous_user)) {
    return c.json({ message: "access role must be guest or null" }, 400);
  }
  if (body.guest_app_id !== undefined && body.guest_app_id !== null) {
    if (typeof body.guest_app_id !== "string" || !requireValidId(body.guest_app_id) || !(await isEligibleSpaceGuestApp(spaceId, body.guest_app_id))) {
      return c.json({ code: "guest_app_invalid", message: "guest page must be a published public App in this Space" }, 400);
    }
  }

  const updateSet: {
    signedInUserRole?: AccessPolicyRole;
    anonymousUserRole?: AccessPolicyRole;
    guestAppId?: string | null;
    updatedBy: string;
    updatedAt: Date;
  } = {
    updatedBy: user.uuid,
    updatedAt: new Date(),
  };
  if (body.signed_in_user !== undefined) updateSet.signedInUserRole = body.signed_in_user;
  if (body.anonymous_user !== undefined) updateSet.anonymousUserRole = body.anonymous_user;
  if (body.guest_app_id !== undefined) updateSet.guestAppId = body.guest_app_id;

  const [policy] = await db
    .insert(accessPolicies)
    .values({
      resourceType: "space",
      resourceId: spaceId,
      signedInUserRole: body.signed_in_user ?? null,
      anonymousUserRole: body.anonymous_user ?? null,
      guestAppId: body.guest_app_id ?? null,
      createdBy: user.uuid,
      updatedBy: user.uuid,
    })
    .onConflictDoUpdate({
      target: [accessPolicies.resourceType, accessPolicies.resourceId],
      set: updateSet,
    })
    .returning();

  return c.json({
    signed_in_user: policy?.signedInUserRole ?? null,
    anonymous_user: policy?.anonymousUserRole ?? null,
    guest_app_id: policy?.guestAppId ?? null,
  });
});

export default router;
