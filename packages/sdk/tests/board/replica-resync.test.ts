import assert from "node:assert/strict";
import { test } from "node:test";
import type { BoardDelta, BoardDocument, BoardReadResult } from "@cohub/protocol";
import { createBoardReplica } from "../../src/board/replica/index.js";
import { boardDocument } from "./fixtures.js";

const meta = (version: number) => ({ id: "b", title: "Board", version, updatedAt: null, playback: null, board: boardDocument({}).board });

for (const via of ["read", "realtime"] as const) {
	test(`a write the server kept only in part settles on what it kept, by ${via}`, async (t) => {
		const history: BoardDelta[] = [];
		const persisted: BoardDocument[] = [];
		let hold: Promise<void> | undefined;
		const replica = createBoardReplica({
			remote: {
				get: async (read): Promise<BoardReadResult> => {
					await hold;
					return { ...meta(history.length), changes: history.slice(read?.since ?? 0) };
				},
				apply: async (_patch, { mutationId }) => {
					history.push({ items: { a: boardDocument({ items: { a: { type: "shape" } } }).items.a ?? null } });
					return { mutationId, status: "applied", replayed: false, version: history.length, changed: { board: false, items: ["a"], animations: [] }, diagnostics: [] };
				},
			},
			storage: {
				listPending: async () => [], putPending: async () => undefined, deletePending: async () => undefined,
				readDocument: async () => ({ version: 0, document: boardDocument({}) }),
				writeDocument: async (_version, document) => void persisted.push(document),
			},
			persistIntervalMs: 0,
		});
		t.after(() => replica.dispose());
		await replica.start();
		const read = Promise.withResolvers<void>();
		hold = read.promise;
		await replica.apply({ items: { a: { type: "shape" }, b: { type: "shape" } } });
		assert.ok(replica.state.document?.items.b);
		if (via === "realtime") replica.receive({ mutationId: "m", baseVersion: 0, version: 1, after: history[0] });
		read.resolve();
		for (let tick = 0; tick < 2; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
		assert.ok(replica.state.document?.items.a);
		assert.equal(replica.state.document?.items.b, undefined);
		assert.equal(replica.state.version, 1);
		assert.ok(persisted.length && persisted.every((document) => !document.items.b));
	});
}
