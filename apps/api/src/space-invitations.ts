import { randomBytes } from "node:crypto";
import { isRoleHigherThan } from "@cohub/core/permissions";
import {
  spaceInvitationRedemptions,
  spaceInvitations,
  spaceMembers,
  spaces,
  userProfiles,
  type SpaceRole,
} from "@cohub/db";
import { isUuidLike } from "@cohub/protocol/identifiers";
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db/index.js";

export const SPACE_INVITATION_ROLES: readonly SpaceRole[] = ["host", "builder", "guest"];
export const DEFAULT_INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MAX_INVITATION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const MAX_INVITATION_USES = 10_000;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const TOKEN_CREATE_ATTEMPTS = 5;

const LOWER_ROLES: Record<SpaceRole, SpaceRole[]> = {
  host: ["builder", "guest"],
  builder: ["guest"],
  guest: [],
};

export type SpaceInvitationRow = typeof spaceInvitations.$inferSelect;
export type InvitationStatus = "active" | "revoked" | "exhausted" | "expired";
export type InvitationListStatus = "active" | "all";

export type InvitationSpaceLocation = {
  spaceId: string;
  spaceName: string;
  spaceSlug: string | null;
  ownerUsername: string | null;
};

export class InvalidInvitationListQueryError extends Error {
  override name = "InvalidInvitationListQueryError";
}

export function generateInvitationToken() {
  return randomBytes(16).toString("base64url");
}

export function getInvitationStatus(
  invitation: Pick<SpaceInvitationRow, "revokedAt" | "expiresAt" | "maxUses" | "useCount">,
  now = new Date(),
): InvitationStatus {
  if (invitation.revokedAt) return "revoked";
  if (invitation.maxUses > 0 && invitation.useCount >= invitation.maxUses) return "exhausted";
  if (invitation.expiresAt && invitation.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

export function serializeInvitation(invitation: SpaceInvitationRow, now = new Date()) {
  const expiresInSeconds = invitation.expiresAt
    ? Math.max(0, Math.ceil((invitation.expiresAt.getTime() - now.getTime()) / 1000))
    : null;
  return {
    id: invitation.id,
    token: invitation.token,
    role: invitation.role,
    status: getInvitationStatus(invitation, now),
    useCount: invitation.useCount,
    maxUses: invitation.maxUses || null,
    createdBy: invitation.createdBy,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt?.toISOString() ?? null,
    expiresInSeconds,
  };
}

const activeInvitation = (now: Date) =>
  and(
    isNull(spaceInvitations.revokedAt),
    or(isNull(spaceInvitations.expiresAt), gt(spaceInvitations.expiresAt, now)),
    or(eq(spaceInvitations.maxUses, 0), lt(spaceInvitations.useCount, spaceInvitations.maxUses)),
  );

export async function getInvitationSpaceLocation(spaceId: string): Promise<InvitationSpaceLocation | null> {
  const [space] = await db
    .select({
      spaceId: spaces.id,
      spaceName: spaces.name,
      spaceSlug: spaces.slug,
      ownerUsername: userProfiles.username,
    })
    .from(spaces)
    .leftJoin(userProfiles, eq(userProfiles.userUuid, spaces.userUuid))
    .where(eq(spaces.id, spaceId))
    .limit(1);
  return space ?? null;
}

export async function createSpaceInvitation(input: {
  spaceId: string;
  role: SpaceRole;
  createdBy: string;
  maxUses: number;
  expiresAt: Date | null;
}): Promise<SpaceInvitationRow> {
  const createdAt = new Date();
  for (let attempt = 0; attempt < TOKEN_CREATE_ATTEMPTS; attempt += 1) {
    const [invitation] = await db
      .insert(spaceInvitations)
      .values({ ...input, token: generateInvitationToken(), createdAt, updatedAt: createdAt })
      .onConflictDoNothing({ target: spaceInvitations.token })
      .returning();
    if (invitation) return invitation;
  }
  throw new Error("Failed to generate a unique invitation code");
}

export function encodeInvitationCursor(invitation: Pick<SpaceInvitationRow, "createdAt" | "id">) {
  return Buffer.from(JSON.stringify([invitation.createdAt.toISOString(), invitation.id])).toString("base64url");
}

function decodeInvitationCursor(value: string): { createdAt: Date; id: string } {
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as [unknown, unknown];
    const date = typeof createdAt === "string" ? new Date(createdAt) : null;
    if (date && !Number.isNaN(date.getTime()) && isUuidLike(id)) return { createdAt: date, id };
  } catch {
  }
  throw new InvalidInvitationListQueryError("invalid cursor");
}

export async function listSpaceInvitations(
  spaceId: string,
  options: { status?: InvitationListStatus; limit?: number; cursor?: string | null } = {},
) {
  const limit = Math.min(Math.max(1, Math.floor(options.limit ?? DEFAULT_LIST_LIMIT)), MAX_LIST_LIMIT);
  const cursor = options.cursor ? decodeInvitationCursor(options.cursor) : null;
  const now = new Date();
  const rows = await db
    .select()
    .from(spaceInvitations)
    .where(and(
      eq(spaceInvitations.spaceId, spaceId),
      options.status === "active" ? activeInvitation(now) : undefined,
      cursor
        ? or(
            lt(spaceInvitations.createdAt, cursor.createdAt),
            and(eq(spaceInvitations.createdAt, cursor.createdAt), lt(spaceInvitations.id, cursor.id)),
          )
        : undefined,
    ))
    .orderBy(desc(spaceInvitations.createdAt), desc(spaceInvitations.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const hasMore = rows.length > limit;
  return {
    items: page.map((row) => serializeInvitation(row, now)),
    pageInfo: { nextCursor: hasMore && last ? encodeInvitationCursor(last) : null, hasMore },
  };
}

export async function revokeSpaceInvitation(spaceId: string, token: string, revokedBy: string) {
  const now = new Date();
  const [revoked] = await db
    .update(spaceInvitations)
    .set({ revokedAt: now, revokedBy, updatedAt: now })
    .where(and(
      eq(spaceInvitations.spaceId, spaceId),
      eq(spaceInvitations.token, token),
      isNull(spaceInvitations.revokedAt),
    ))
    .returning({ id: spaceInvitations.id });
  if (revoked) return true;
  const [existing] = await db
    .select({ id: spaceInvitations.id })
    .from(spaceInvitations)
    .where(and(eq(spaceInvitations.spaceId, spaceId), eq(spaceInvitations.token, token)))
    .limit(1);
  return Boolean(existing);
}

export async function findSpaceInvitation(token: string): Promise<SpaceInvitationRow | null> {
  if (!token || token.length > 64) return null;
  const [invitation] = await db.select().from(spaceInvitations).where(eq(spaceInvitations.token, token)).limit(1);
  return invitation ?? null;
}

export type InvitationRedemption =
  | { status: "joined" | "member"; invitation: SpaceInvitationRow; role: SpaceRole }
  | { status: Exclude<InvitationStatus, "active"> | "missing" };

class UnchangedMembership extends Error {}

export async function redeemSpaceInvitation(
  invitation: SpaceInvitationRow,
  userId: string,
): Promise<InvitationRedemption> {
  const status = getInvitationStatus(invitation);
  if (status !== "active") return { status };

  const currentRole = async () => {
    const [member] = await db
      .select({ role: spaceMembers.role })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, invitation.spaceId), eq(spaceMembers.userId, userId)))
      .limit(1);
    return member?.role ?? null;
  };
  const existing = await currentRole();
  if (existing && !isRoleHigherThan(invitation.role, existing)) {
    return { status: "member", invitation, role: existing };
  }

  try {
    return await db.transaction(async (tx): Promise<InvitationRedemption> => {
      const now = new Date();
      const [claimed] = await tx
        .update(spaceInvitations)
        .set({ useCount: sql`${spaceInvitations.useCount} + 1`, updatedAt: now })
        .where(and(eq(spaceInvitations.id, invitation.id), activeInvitation(now)))
        .returning();
      if (!claimed) {
        const [latest] = await tx.select().from(spaceInvitations).where(eq(spaceInvitations.id, invitation.id)).limit(1);
        const latestStatus = latest ? getInvitationStatus(latest, now) : "missing";
        return { status: latestStatus === "active" ? "exhausted" : latestStatus };
      }

      const [granted] = await tx
        .insert(spaceMembers)
        .values({
          spaceId: invitation.spaceId,
          userId,
          role: invitation.role,
          createdBy: invitation.createdBy,
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [spaceMembers.spaceId, spaceMembers.userId],
          set: { role: invitation.role, updatedBy: userId, updatedAt: now },
          setWhere: inArray(spaceMembers.role, LOWER_ROLES[invitation.role]),
        })
        .returning({ role: spaceMembers.role });
      // A concurrent accept already granted this role: roll back the use.
      if (!granted) throw new UnchangedMembership();

      await tx.insert(spaceInvitationRedemptions).values({
        invitationId: invitation.id,
        spaceId: invitation.spaceId,
        userId,
        previousRole: existing,
        role: granted.role,
        createdAt: now,
      });
      return { status: "joined", invitation: claimed, role: granted.role };
    });
  } catch (error) {
    if (!(error instanceof UnchangedMembership)) throw error;
    return { status: "member", invitation, role: (await currentRole()) ?? invitation.role };
  }
}
