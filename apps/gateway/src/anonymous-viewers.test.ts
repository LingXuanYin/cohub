import assert from "node:assert/strict";
import { test } from "node:test";
import type { RealtimeEnvelope } from "@cohub/protocol/realtime";
import { anonymousEnvelope } from "./anonymous-viewers.js";

const envelope = (type: string, payload: Record<string, unknown>): RealtimeEnvelope => ({
	id: "e1",
	timestamp: 1,
	domain: "space",
	type,
	spaceId: "s1",
	payload,
});

test("anonymous viewers see Board changes without who made them", () => {
	const changed = anonymousEnvelope(envelope("board.changed", {
		boardId: "b1",
		actorId: "user-1",
		actor: { kind: "agent" },
		source: { sessionId: "session-1", turnId: "turn-1" },
		mutationId: "m1",
		baseVersion: 1,
		version: 2,
		changed: { board: false, items: ["i1"], animations: [] },
		after: { items: { i1: { type: "text" } } },
	}));
	assert.deepEqual(changed?.payload, {
		boardId: "b1",
		mutationId: "m1",
		baseVersion: 1,
		version: 2,
		changed: { board: false, items: ["i1"], animations: [] },
		after: { items: { i1: { type: "text" } } },
	});
	assert.ok(anonymousEnvelope(envelope("board.playback.changed", { boardId: "b1", playback: null })));
	assert.equal(anonymousEnvelope(envelope("board.awareness.updated", { boardId: "b1", actorName: "Ann" })), null);
	assert.equal(anonymousEnvelope(envelope("space.fs.changed", { changes: [] })), null);
});
