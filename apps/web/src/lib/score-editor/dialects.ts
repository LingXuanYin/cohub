import type { DialectRegistry, mount } from "@neta-art/score-editor";

/**
 * The models whose songs the editor can open: one id per dialect it is mounted with. Entries need
 * this at first paint, so it is a plain list; the editor and the dialects load when the layer
 * opens (see `loadScoreEditor`) and a test holds the two in step.
 */
export const scoreModelIds: ReadonlySet<string> = new Set(["song2"]);

type LoadedScoreEditor = {
	mount: typeof mount;
	dialects: DialectRegistry;
};

let loading: Promise<LoadedScoreEditor> | null = null;

/** Loads the editor and its dialects once, on first use, so the app's first screen does not carry them. */
export function loadScoreEditor(): Promise<LoadedScoreEditor> {
	loading ??= Promise.all([
		import("@neta-art/score-editor"),
		import("@neta-art/score-dialect-song2"),
	])
		.then(([editor, song2]) => ({
			mount: editor.mount,
			dialects: editor.createDialectRegistry([song2.song2Dialect]),
		}))
		.catch((error: unknown) => {
			loading = null;
			throw error;
		});
	return loading;
}
