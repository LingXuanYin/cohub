import assert from "node:assert/strict";
import { test } from "node:test";
import type { BoardReadInput, BoardReadResult } from "@cohub/protocol";
import { createBoardReplica } from "../../src/board/replica/index.js";
import { boardDocument } from "./fixtures.js";

test("resync reads items only when the Board version changed", async (t) => {
	let version = 1;
	let resync: (() => void) | undefined;
	const reads: Array<Pick<BoardReadInput, "only"> | undefined> = [];
	const replica = createBoardReplica({ remote: {
		get: async (read): Promise<BoardReadResult> => {
			reads.push(read);
			return { id: "b", title: "Board", version, updatedAt: null, playback: null, ...boardDocument({}) };
		},
		apply: async () => { throw new Error("Unexpected write"); },
		subscribe: (handlers) => { resync = handlers.resync; return () => undefined; },
	} });
	t.after(() => replica.dispose());
	await replica.start();
	resync?.();
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(reads, [undefined, { only: [] }]);
	version = 2;
	resync?.();
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(reads, [undefined, { only: [] }, { only: [] }, undefined]);
	assert.equal(replica.state.version, 2);
});
