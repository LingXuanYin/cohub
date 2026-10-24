import type { MediaFacts } from "@cohub/protocol/core";
import { deleteByIndex, indexedDb } from "../indexeddb.js";

export type StoredFileUrl = { url: string; verifiedAt: number; media?: MediaFacts };

type FileUrlRecord = StoredFileUrl & { key: string; scope: string };

const DATABASE = "cohub-file-urls";
const STORE = "urls";
const MAX_ENTRIES = 20_000;
const TRIM_TO = 18_000;
const TRIM_EVERY_WRITES = 500;

const database = indexedDb(DATABASE, 1, (db) => {
	const store = db.createObjectStore(STORE, { keyPath: "key" });
	store.createIndex("scope", "scope");
	store.createIndex("verifiedAt", "verifiedAt");
});

const recordKey = (scope: string, spaceId: string, path: string) => `${scope}\u0000${spaceId}\u0000${path}`;

let writes = 0;

export const fileUrlStore = {
	read(scope: string, spaceId: string, paths: readonly string[]): Promise<ReadonlyMap<string, StoredFileUrl>> {
		return database.transact([STORE], "readonly", (tx) => {
			const store = tx.objectStore(STORE);
			const requests = paths.map((path) => [path, store.get(recordKey(scope, spaceId, path))] as const);
			return () => {
				const found = new Map<string, StoredFileUrl>();
				for (const [path, request] of requests) {
					const record = request.result as FileUrlRecord | undefined;
					if (record) found.set(path, { url: record.url, verifiedAt: record.verifiedAt, media: record.media });
				}
				return found;
			};
		});
	},
	async write(scope: string, spaceId: string, changes: { put: ReadonlyMap<string, StoredFileUrl>; remove: Iterable<string> }) {
		await database.transact([STORE], "readwrite", (tx) => {
			const store = tx.objectStore(STORE);
			for (const [path, stored] of changes.put)
				store.put({ ...stored, key: recordKey(scope, spaceId, path), scope } satisfies FileUrlRecord);
			for (const path of changes.remove) store.delete(recordKey(scope, spaceId, path));
			return () => undefined;
		});
		writes += changes.put.size;
		if (writes < TRIM_EVERY_WRITES) return;
		writes = 0;
		await trim();
	},
};

function trim() {
	return database.transact([STORE], "readwrite", (tx) => {
		const store = tx.objectStore(STORE);
		const count = store.count();
		count.onsuccess = () => {
			let excess = count.result > MAX_ENTRIES ? count.result - TRIM_TO : 0;
			if (excess === 0) return;
			const cursor = store.index("verifiedAt").openKeyCursor();
			cursor.onsuccess = () => {
				const current = cursor.result;
				if (!current || excess-- <= 0) return;
				store.delete(current.primaryKey);
				current.continue();
			};
		};
		return () => undefined;
	});
}

export async function clearFileUrlCache(options: { scope?: string } = {}): Promise<void> {
	if (!globalThis.indexedDB) return;
	await database.transact([STORE], "readwrite", (tx) => {
		const store = tx.objectStore(STORE);
		if (options.scope === undefined) store.clear();
		else deleteByIndex(store, "scope", options.scope);
		return () => undefined;
	});
}
