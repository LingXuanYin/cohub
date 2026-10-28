import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import * as schema from "@cohub/db";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

process.env.LOG_LEVEL = "silent";

const migrations = join(dirname(fileURLToPath(import.meta.url)), "../drizzle/v2");
const client = new PGlite({ extensions: { pg_trgm } });
const journal = JSON.parse(readFileSync(join(migrations, "meta/_journal.json"), "utf8")) as { entries: Array<{ tag: string }> };
for (const entry of journal.entries) {
  await client.exec(readFileSync(join(migrations, `${entry.tag}.sql`), "utf8").replaceAll("--> statement-breakpoint", ""));
}
const db = drizzle(client, { schema });

mock.module("../src/db/index.js", { namedExports: { db } });
mock.module("../src/realtime-events.js", { namedExports: {
  dispatchTurnCreated: async () => {},
  dispatchSessionUpdated: async () => {},
  dispatchSessionCreated: async () => {},
  dispatchLabelAssignmentsUpdated: async () => {},
  messageRecordFromRow: (row: unknown) => row,
} });
mock.module("../src/session-output.js", { namedExports: {
  buildSessionOutputsForPersistedMessage: async () => [],
  dispatchSessionOutputs: async () => {},
  dispatchTurnFinalized: async () => {},
  dispatchTurnUpdated: async () => {},
} });
mock.module("../src/space-activity.js", { namedExports: { touchSpaceActivity: async () => {} } });
mock.module("../src/session-title-queue.js", { namedExports: { enqueueSessionTitleGeneration: async () => {} } });
mock.module("../src/session-message-postprocess-queue.js", { namedExports: { enqueueSessionMessagePostprocess: async () => {} } });
mock.module("../src/agent-turn-queue.js", { namedExports: { enqueueAgentSessionForkJob: async () => {} } });
mock.module("../src/agent-turn-abort.js", { namedExports: { requestAgentTurnAbort: async () => {} } });
mock.module("../src/space-sandboxes.js", { namedExports: { getSpaceSandboxBySpaceId: async () => null, updateSpaceSandbox: async () => null } });
mock.module("../src/user-profiles.js", { namedExports: { fallbackPublicUserProfile: () => null, getProfilesByUuids: async () => new Map() } });
mock.module("@cohub/core/labels/session-user", { namedExports: { assignSessionParticipantSystemLabels: async () => [] } });

const { recordSessionNote } = await import("../src/session-notes.js");

test("notes are idempotent per client message ID and safe under concurrent writes", async () => {
  const spaceId = crypto.randomUUID();
  const [session] = await db.insert(schema.spaceSessions).values({ spaceId, userUuid: "author", meta: {} }).returning();
  assert.ok(session);
  const note = (clientMessageId: string) => recordSessionNote({ spaceId, sessionId: session.id, userId: "author", clientMessageId, content: [{ type: "text", text: clientMessageId }] });

  const retries = await Promise.all([note("a"), note("a"), note("a")]);
  assert.equal(new Set(retries.map((turn) => turn.id)).size, 1);
  await Promise.all([note("b"), note("c"), note("d")]);

  const turns = await db.select().from(schema.sessionTurns).where(eq(schema.sessionTurns.sessionId, session.id)).orderBy(asc(schema.sessionTurns.sequence));
  const messages = await db.select().from(schema.sessionMessages).where(eq(schema.sessionMessages.sessionId, session.id)).orderBy(asc(schema.sessionMessages.sequence));
  assert.deepEqual(turns.map((turn) => [turn.executionKind, turn.status]), Array(4).fill(["note", "completed"]));
  assert.deepEqual(messages.map((message) => message.sequence), [1, 2, 3, 4]);
  assert.deepEqual(new Set(messages.map((message) => message.turnId)), new Set(turns.map((turn) => turn.id)));
});
