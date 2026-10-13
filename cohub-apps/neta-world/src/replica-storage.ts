import type {
	BoardReplicaStorage,
	BoardPendingPatch,
} from "@neta-art/cohub/board/replica";

export async function openReplicaStorage(scope: string) {
	const db = await new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open("neta-world-cache", 1);
		request.onupgradeneeded = () => request.result.createObjectStore("entries");
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		request.onblocked = () =>
			reject(new Error("Board cache is blocked by another window."));
	});
	const prefix = `${scope}:`;
	const access = <T>(
		mode: IDBTransactionMode,
		action: (store: IDBObjectStore) => IDBRequest<T>,
	) =>
		new Promise<T>((resolve, reject) => {
			const tx = db.transaction("entries", mode);
			const request = action(tx.objectStore("entries"));
			tx.oncomplete = () => resolve(request.result);
			tx.onerror = () => reject(tx.error);
			tx.onabort = () =>
				reject(tx.error ?? new Error("Board cache transaction was aborted."));
		});
	let pendingError: unknown = null;
	const storage: BoardReplicaStorage = {
		async listPending() {
			const records: Array<BoardPendingPatch & { order?: number }> =
				await access("readonly", (store) =>
					store.getAll(
						IDBKeyRange.bound(`${prefix}pending:`, `${prefix}pending:\uffff`),
					),
				);
			return records
				.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
				.map(({ mutationId, patch }) => ({ mutationId, patch }));
		},
		async putPending(entry) {
			try {
				await new Promise<void>((resolve, reject) => {
					// Ordering lives in the same transaction as the patch. UUID ordering
					// would replay offline edits incorrectly after a restart.
					const tx = db.transaction("entries", "readwrite");
					const store = tx.objectStore("entries");
					const key = `${prefix}pending:${entry.mutationId}`;
					const existing = store.get(key);
					existing.onsuccess = () => {
						if (existing.result) return;
						const counter = store.get(`${prefix}order`);
						counter.onsuccess = () => {
							const order = Number(counter.result ?? 0) + 1;
							store.put({ ...entry, order }, key);
							store.put(order, `${prefix}order`);
						};
					};
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
					tx.onabort = () =>
						reject(tx.error ?? new Error("Pending Board write was aborted."));
				});
				pendingError = null;
			} catch (error) {
				pendingError = error;
				throw error;
			}
		},
		deletePending: (id) =>
			access("readwrite", (store) =>
				store.delete(`${prefix}pending:${id}`),
			).then(() => undefined),
		readDocument: async () =>
			(await access("readonly", (store) => store.get(`${prefix}document`))) ??
			null,
		writeDocument: (version, document) =>
			access("readwrite", (store) =>
				store.put({ version, document }, `${prefix}document`),
			).then(() => undefined),
	};
	return {
		storage,
		get pendingError() {
			return pendingError;
		},
		close: () => db.close(),
	};
}
