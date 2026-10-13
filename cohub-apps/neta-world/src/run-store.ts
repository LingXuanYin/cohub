import { parseRun, type Run } from "./conversation";

export class RunStore {
	constructor(
		private storage: Pick<Storage, "getItem" | "setItem">,
		private scope: string,
	) {}
	private key(workId: string) {
		return `neta-world:run:v1:${this.scope}:${workId}`;
	}
	read(workId: string): Run | null {
		const value = this.storage.getItem(this.key(workId));
		return value ? parseRun(JSON.parse(value), workId) : null;
	}
	save(run: Run, previous: Run | null) {
		const current = this.read(run.workId);
		if (
			current &&
			(!previous ||
				current.id !== previous.id ||
				current.revision !== previous.revision)
		)
			throw new Error("The conversation run changed in another window.");
		this.storage.setItem(this.key(run.workId), JSON.stringify(run));
	}
	restart(next: Run, previous: Run) {
		const current = this.read(previous.workId);
		if (
			!current ||
			current.id !== previous.id ||
			current.revision !== previous.revision
		)
			throw new Error("The conversation run changed in another window.");
		this.storage.setItem(
			`${this.key(previous.workId)}:archive:${previous.id}`,
			JSON.stringify(previous),
		);
		this.storage.setItem(this.key(next.workId), JSON.stringify(next));
	}
}
