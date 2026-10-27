import { getContext, setContext } from "svelte";

const SCORE_EDITOR_HOST = Symbol("score-editor-host");

export type ScoreEditorHost = {
	/** Whether the environment gives the editor App a ref. */
	enabled: boolean;
	/** Opens the generation in the editor App; `false` when the ref no longer resolves. */
	open: (taskRunId: string) => Promise<boolean>;
};

export function setScoreEditorHost(host: ScoreEditorHost) {
	setContext(SCORE_EDITOR_HOST, host);
}

export function getScoreEditorHost(): ScoreEditorHost | null {
	return getContext<ScoreEditorHost | undefined>(SCORE_EDITOR_HOST) ?? null;
}
