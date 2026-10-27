import { getContext, setContext } from "svelte";
import type { ScoreOpenResult } from "$lib/score-editor/task-score";

const SCORE_EDITOR_HOST = Symbol("score-editor-host");

export type ScoreEditorHost = {
	/** Whether the environment gives the editor App a ref. */
	enabled: boolean;
	/** Opens the generation in the editor App; `unavailable` latches the raw text. */
	open: (taskRunId: string) => Promise<ScoreOpenResult>;
};

export function setScoreEditorHost(host: ScoreEditorHost) {
	setContext(SCORE_EDITOR_HOST, host);
}

export function getScoreEditorHost(): ScoreEditorHost | null {
	return getContext<ScoreEditorHost | undefined>(SCORE_EDITOR_HOST) ?? null;
}
