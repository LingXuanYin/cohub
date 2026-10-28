/**
 * One-time move of Redis-backed Space invitations into Postgres.
 *
 *   pnpm --filter @cohub/api exec tsx scripts/migrate-space-invitations.ts          # dry run
 *   pnpm --filter @cohub/api exec tsx scripts/migrate-space-invitations.ts --apply  # write
 */
import "dotenv/config";
import { spaceInvitations, spaces, type SpaceRole } from "@cohub/db";
import { isUuidLike } from "@cohub/protocol/identifiers";
import { inArray } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { redisCommandClient as redis } from "../src/redis.js";

const apply = process.argv.includes("--apply");
const ROLES = new Set<string>(["host", "builder", "guest"]);
const SCAN_COUNT = 500;

type Row = typeof spaceInvitations.$inferInsert;

const toInt = (value: string | undefined) => {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
};

function toRow(token: string, data: Record<string, string>, ttlMs: number, now: Date): Row | string {
  if (!isUuidLike(data.space_id)) return "invalid space";
  if (!data.role || !ROLES.has(data.role)) return "invalid role";
  if (!data.creator_id) return "missing creator";
  if (!(ttlMs > 0)) return "expired";
  const createdAt = new Date(data.created_at ?? "");
  const created = Number.isNaN(createdAt.getTime()) ? now : createdAt;
  return {
    token,
    spaceId: data.space_id,
    role: data.role as SpaceRole,
    createdBy: data.creator_id,
    maxUses: toInt(data.max_uses),
    useCount: toInt(data.use_count),
    expiresAt: new Date(now.getTime() + ttlMs),
    revokedAt: data.status === "revoked" ? now : null,
    createdAt: created,
    updatedAt: now,
  };
}

async function main() {
  console.log(`[Invitations] ${apply ? "Applying" : "Dry run"}`);
  const now = new Date();
  const rows: Row[] = [];
  const skipped = new Map<string, number>();
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);

  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "invite:*", "COUNT", SCAN_COUNT);
    cursor = next;
    const tokens = keys.filter((key) => !key.startsWith("invite:space:")).map((key) => key.slice("invite:".length));
    if (tokens.length === 0) continue;
    const pipeline = redis.pipeline();
    for (const token of tokens) pipeline.hgetall(`invite:${token}`).pttl(`invite:${token}`);
    const results = (await pipeline.exec()) ?? [];
    for (const [index, token] of tokens.entries()) {
      const [dataError, data] = results[index * 2] ?? [];
      const [ttlError, ttl] = results[index * 2 + 1] ?? [];
      const row = dataError || ttlError || !data || Object.keys(data).length === 0
        ? "unreadable"
        : toRow(token, data as Record<string, string>, Number(ttl), now);
      if (typeof row === "string") skip(row);
      else rows.push(row);
    }
  } while (cursor !== "0");

  const spaceIds = [...new Set(rows.map((row) => row.spaceId))];
  const existingSpaces = new Set<string>();
  for (let index = 0; index < spaceIds.length; index += 500) {
    const found = await db.select({ id: spaces.id }).from(spaces).where(inArray(spaces.id, spaceIds.slice(index, index + 500)));
    for (const space of found) existingSpaces.add(space.id);
  }
  const existingTokens = new Set<string>();
  for (let index = 0; index < rows.length; index += 500) {
    const found = await db
      .select({ token: spaceInvitations.token })
      .from(spaceInvitations)
      .where(inArray(spaceInvitations.token, rows.slice(index, index + 500).map((row) => row.token)));
    for (const row of found) existingTokens.add(row.token);
  }

  const pending: Row[] = [];
  for (const row of rows) {
    if (!existingSpaces.has(row.spaceId)) skip("space missing");
    else if (existingTokens.has(row.token)) skip("already migrated");
    else pending.push(row);
  }

  let inserted = 0;
  if (apply) {
    for (let index = 0; index < pending.length; index += 200) {
      const batch = await db
        .insert(spaceInvitations)
        .values(pending.slice(index, index + 200))
        .onConflictDoNothing({ target: spaceInvitations.token })
        .returning({ id: spaceInvitations.id });
      inserted += batch.length;
    }
  }

  console.log(`[Invitations] Found ${rows.length} in Redis, ${pending.length} to migrate${apply ? `, ${inserted} inserted` : ""}.`);
  for (const [reason, count] of skipped) console.log(`  skipped ${count}: ${reason}`);
  if (!apply && pending.length > 0) console.log("[Invitations] Run again with --apply to write.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[Invitations] Failed:", error);
    process.exit(1);
  });
