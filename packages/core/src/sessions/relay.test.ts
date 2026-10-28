import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { sessionMessages, sessionTurns, spaceMembers, spaceSessions, spaces } from "@cohub/db";
import { readSessionTurnOrigin, readSessionTurnRelay } from "@cohub/protocol/model";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createDrizzlePermissionStore } from "../permissions/index.js";
import type { ReferenceInput } from "../references/types.js";
import { deliverTurnReplies } from "./reply.js";
import { createSessionServices } from "./service.js";

const migrations = join(dirname(fileURLToPath(import.meta.url)), "../../../../apps/api/drizzle/v2");
const client = new PGlite({ extensions: { pg_trgm } });
const journal = JSON.parse(readFileSync(join(migrations, "meta/_journal.json"), "utf8")) as { entries: Array<{ tag: string }> };
for (const entry of journal.entries) {
	await client.exec(readFileSync(join(migrations, `${entry.tag}.sql`), "utf8").replaceAll("--> statement-breakpoint", ""));
}
const db = drizzle(client) as unknown as PostgresJsDatabase<Record<string, unknown>>;

const USER = "user-1";
const indexed: ReferenceInput[] = [];
const services = createSessionServices({
	db,
	redis: {} as never,
	promptTemplateService: { expand: async () => null },
	agentTurnQueue: { enqueue: async () => {} },
	enqueueReferences: (references) => { indexed.push(...references); },
	logger: { warn: () => {} },
});

async function space(name: string, role: "builder" | "guest" = "builder") {
	const [row] = await db.insert(spaces).values({ userUuid: crypto.randomUUID(), name }).returning();
	assert.ok(row);
	await db.insert(spaceMembers).values({ spaceId: row.id, userId: USER, role, createdBy: "owner", updatedBy: "owner" });
	const [session] = await db.insert(spaceSessions).values({ spaceId: row.id, userUuid: USER, meta: {} }).returning();
	assert.ok(session);
	return { spaceId: row.id, sessionId: session.id };
}

const prompt = (from: { spaceId: string; sessionId: string }, text: string) => services.submitPrompt({
	...from,
	userId: USER,
	clientMessageId: crypto.randomUUID(),
	content: [{ type: "text", text }],
	source: "web",
});
const turnsOf = (sessionId: string) => db.select().from(sessionTurns).where(eq(sessionTurns.sessionId, sessionId)).orderBy(asc(sessionTurns.sequence));

test("notes are idempotent per client message ID and safe under concurrent writes", async () => {
	const { sessionId } = await space("Notes");
	const note = (clientMessageId: string) => services.recordNote({ sessionId, userUuid: USER, clientMessageId, content: [{ type: "text", text: clientMessageId }] });
	const retries = await Promise.all([note("a"), note("a"), note("a")]);
	assert.equal(new Set(retries.map((turn) => turn.id)).size, 1);
	await Promise.all([note("b"), note("c")]);
	const messages = await db.select().from(sessionMessages).where(eq(sessionMessages.sessionId, sessionId)).orderBy(asc(sessionMessages.sequence));
	assert.deepEqual(messages.map((message) => message.sequence), [1, 2, 3]);
});

test("a leading Space mention relays the prompt there and its reply returns as a note", async () => {
	const a = await space("Home");
	const b = await space("Design");
	indexed.length = 0;
	const { turnId } = await prompt(a, `@[Design](cohub://spaces/${b.spaceId}) tidy the header`);
	const target = readSessionTurnRelay((await turnsOf(a.sessionId))[0]?.meta)?.sessionId ?? "";
	const [child] = await turnsOf(target);
	assert.deepEqual(child?.userContent, [{ type: "text", text: "tidy the header" }]);
	assert.deepEqual(indexed.map((ref) => [ref.kind, ref.sourceId, ref.targetId]), [["mention", turnId, b.spaceId], ["turn_trigger", turnId, child?.id]]);

	await db.update(sessionTurns).set({ status: "completed", assistantContent: [{ type: "text", text: "Done." }] }).where(eq(sessionTurns.id, child?.id ?? ""));
	const permissions = createDrizzlePermissionStore(db);
	await deliverTurnReplies({ db, services, permissions }, child?.id ?? "");
	await deliverTurnReplies({ db, services, permissions }, child?.id ?? "");
	const [, reply, extra] = await turnsOf(a.sessionId);
	assert.equal(extra, undefined);
	assert.equal(readSessionTurnOrigin(reply?.meta)?.kind, "reply");
	assert.deepEqual(reply?.userContent.at(-1), { type: "text", text: "Done." });
});

test("without access there, the mention stays context for this Chat's Agent", async () => {
	const a = await space("Home");
	const b = await space("Design", "guest");
	await prompt(a, `@[Design](cohub://spaces/${b.spaceId}) thoughts?`);
	const [turn] = await turnsOf(a.sessionId);
	assert.deepEqual([turn?.executionKind, readSessionTurnRelay(turn?.meta)], ["agent", null]);
});
