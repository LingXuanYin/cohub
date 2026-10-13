import {
	createBoardReplica,
	type BoardReplicaState,
} from "@neta-art/cohub/board/replica";
import type { BoardDocument, BoardPatch } from "@neta-art/cohub/board";
import { client } from "./cohub";
import { openReplicaStorage } from "./replica-storage";

export type Binding = { spaceId: string; boardId: string };
export async function connectBoard(
	binding: Binding,
	viewer: string,
	onState: (state: BoardReplicaState) => void,
) {
	const scope = `${viewer}:${binding.spaceId}:${binding.boardId}`;
	const cache = await openReplicaStorage(scope);
	const replica = createBoardReplica({
		remote: client.space(binding.spaceId).board(binding.boardId),
		storage: cache.storage,
	});
	const stop = replica.subscribe(onState);
	let disposed = false;
	return {
		binding,
		scope,
		get state() {
			return replica.state;
		},
		start(): Promise<void> {
			const started = replica.start();
			return new Promise((resolve, reject) => {
				const wait = replica.subscribe((state) => {
					if (state.document) {
						wait();
						resolve();
					}
				});
				started.then(
					() => {
						wait();
						if (replica.state.document) resolve();
						else
							reject(
								new Error(
									replica.state.error ?? "The remote Board is unavailable.",
								),
							);
					},
					(error) => {
						wait();
						reject(error);
					},
				);
				if (replica.state.document) {
					wait();
					resolve();
				}
			});
		},
		async apply(patch: BoardPatch) {
			await replica.apply(patch);
			if (cache.pendingError) throw cache.pendingError;
		},
		retry: () => replica.retry(),
		resolveFileUrl: (path: string) =>
			client
				.space(binding.spaceId)
				.files.resolveUrl(path, { purpose: "preview" }),
		exportDocument: (): BoardDocument | null => replica.state.document,
		dispose() {
			if (disposed) return;
			disposed = true;
			stop();
			replica.dispose();
			cache.close();
		},
	};
}
export type BoardConnection = Awaited<ReturnType<typeof connectBoard>>;
