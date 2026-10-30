import { apps } from "@cohub/db";
import { isUuidLike } from "@cohub/protocol/identifiers";
import { and, eq } from "drizzle-orm";
import { db } from "./db/index.js";

type SpaceGuestConfig = { appId: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseGuestConfig = (value: unknown): SpaceGuestConfig | null =>
  isRecord(value) && isUuidLike(value.appId) ? { appId: value.appId } : null;

export function readSpaceGuestConfig(meta: unknown): SpaceGuestConfig | null {
  const config = isRecord(meta) && isRecord(meta.config) ? meta.config : null;
  return parseGuestConfig(config?.guest);
}

async function isEligibleGuestApp(spaceId: string, appId: string) {
  const [app] = await db
    .select({ id: apps.id })
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.spaceId, spaceId), eq(apps.status, "published"), eq(apps.visibility, "public")))
    .limit(1);
  return Boolean(app);
}

export async function parseSpaceGuestInput(spaceId: string, value: unknown): Promise<SpaceGuestConfig | null | undefined> {
  if (value === null) return null;
  const guest = parseGuestConfig(value);
  return guest && (await isEligibleGuestApp(spaceId, guest.appId)) ? guest : undefined;
}

export async function resolveSpaceGuestAppId(space: { id: string; meta: unknown }): Promise<string | null> {
  const guest = readSpaceGuestConfig(space.meta);
  return guest && (await isEligibleGuestApp(space.id, guest.appId)) ? guest.appId : null;
}
