import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { openReplicaStorage } from "./replica-storage";
import { seed } from "./world";

test("offline patches replay in transaction order, not UUID order, across reopen", async () => {
	const scope = `order-${crypto.randomUUID()}`;
	const a = await openReplicaStorage(scope);
	await a.storage.putPending({
		mutationId: "z-first",
		patch: { items: { hero: { props: { text: "First" } } } },
	});
	await a.storage.putPending({
		mutationId: "a-second",
		patch: { items: { hero: { props: { text: "Second" } } } },
	});
	await a.storage.putPending({
		mutationId: "z-first",
		patch: { items: { hero: { props: { text: "Retry must not replace" } } } },
	});
	a.close();
	const b = await openReplicaStorage(scope);
	try {
		const pending = await b.storage.listPending();
		assert.deepEqual(
			pending.map((entry) => entry.mutationId),
			["z-first", "a-second"],
		);
		assert.deepEqual(pending[0]?.patch, {
			items: { hero: { props: { text: "First" } } },
		});
		await b.storage.deletePending("z-first");
		assert.deepEqual(
			(await b.storage.listPending()).map((entry) => entry.mutationId),
			["a-second"],
		);
	} finally {
		b.close();
	}
});
test("server cache and pending writes are separate and isolated by user and Board", async () => {
	const id = crypto.randomUUID();
	const a = await openReplicaStorage(`viewer-a:space:${id}`);
	const b = await openReplicaStorage(`viewer-b:space:${id}`);
	const other = await openReplicaStorage(`viewer-a:space:another-${id}`);
	try {
		const document = seed();
		await a.storage.writeDocument(12, document);
		await a.storage.putPending({
			mutationId: "pending",
			patch: { board: { title: "Unsynced change" } },
		});
		assert.deepEqual(await a.storage.readDocument(), { version: 12, document });
		assert.equal(await b.storage.readDocument(), null);
		assert.deepEqual(await b.storage.listPending(), []);
		assert.equal(await other.storage.readDocument(), null);
		assert.deepEqual(await other.storage.listPending(), []);
	} finally {
		a.close();
		b.close();
		other.close();
	}
});
