import { accessPolicies, apps } from "@cohub/db";
import { and, eq } from "drizzle-orm";
import { db } from "./db/index.js";

const isEligibleGuestApp = (spaceId: string) =>
  and(eq(apps.spaceId, spaceId), eq(apps.status, "published"), eq(apps.visibility, "public"));

export async function isEligibleSpaceGuestApp(spaceId: string, appId: string) {
  const [app] = await db
    .select({ id: apps.id })
    .from(apps)
    .where(and(eq(apps.id, appId), isEligibleGuestApp(spaceId)))
    .limit(1);
  return Boolean(app);
}

export async function resolveSpaceGuestAppId(spaceId: string): Promise<string | null> {
  const [row] = await db
    .select({ appId: apps.id })
    .from(accessPolicies)
    .innerJoin(apps, eq(apps.id, accessPolicies.guestAppId))
    .where(and(
      eq(accessPolicies.resourceType, "space"),
      eq(accessPolicies.resourceId, spaceId),
      isEligibleGuestApp(spaceId),
    ))
    .limit(1);
  return row?.appId ?? null;
}
