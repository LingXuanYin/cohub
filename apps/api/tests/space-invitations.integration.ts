import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import * as schema from "@cohub/db";
import { drizzle } from "drizzle-orm/pglite";

process.env.LOG_LEVEL = "silent";

const migrations = join(dirname(fileURLToPath(import.meta.url)), "../drizzle/v2");
const client = new PGlite({ extensions: { pg_trgm } });
const journal = JSON.parse(readFileSync(join(migrations, "meta/_journal.json"), "utf8")) as { entries: Array<{ tag: string }> };
for (const entry of journal.entries) {
  await client.exec(readFileSync(join(migrations, `${entry.tag}.sql`), "utf8").replaceAll("--> statement-breakpoint", ""));
}

mock.module("../src/db/index.js", { namedExports: { db: drizzle(client, { schema }) } });

const { createSpaceInvitation, findSpaceInvitation, redeemSpaceInvitation } = await import("../src/space-invitations.js");

test("concurrent accepts never exceed the usage limit", async () => {
  const { rows } = await client.query<{ id: string }>(`INSERT INTO v2.spaces (user_uuid, name) VALUES ('host', 'Space') RETURNING id`);
  const spaceId = rows[0]?.id;
  assert.ok(spaceId);
  const { token } = await createSpaceInvitation({ spaceId, role: "builder", createdBy: "host", maxUses: 3, expiresAt: null });
  const invitation = await findSpaceInvitation(token);
  assert.ok(invitation);

  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => redeemSpaceInvitation(invitation, `user-${index}`)));
  assert.equal(results.filter((result) => result.status === "joined").length, 3);
  assert.equal((await findSpaceInvitation(token))?.useCount, 3);
  assert.equal((await redeemSpaceInvitation(invitation, "user-0")).status, "member");
});
