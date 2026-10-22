import {
	asRecord,
	contentBlocks,
	generationOutput,
	taskData,
} from "@cohub/protocol";
import type { ContentBlock } from "@cohub/protocol/core";
import type { SessionTurnRecord } from "@cohub/protocol/model";
import type { TaskRunRecord } from "@neta-art/cohub";
import type { SongProject } from "@neta-art/score-editor";
import { SCORE_FILE_DIALECT } from "./dialects";

type RunPayloads = Pick<TaskRunRecord, "payload" | "result">;

/** The text of the first non-blank text block tagged `meta.role`, exactly as stored. */
function roleText(
	blocks: readonly Record<string, unknown>[],
	role: string,
): string | null {
	for (const block of blocks) {
		if (block.type !== "text" || asRecord(block.meta)?.role !== role) continue;
		if (typeof block.text === "string" && block.text.trim()) return block.text;
	}
	return null;
}

/** The score of a song: what the run returned, else what the request carried. */
export function taskRunScore(run: RunPayloads): string | null {
	return (
		roleText(generationOutput(run), "abc") ??
		roleText(contentBlocks(taskData(run)?.content), "abc")
	);
}

function taskRunModelId(run: RunPayloads): string | null {
	const model = taskData(run)?.model ?? asRecord(run.result)?.model;
	return typeof model === "string" && model ? model : null;
}

function seedOf(value: unknown): number | null {
	const seed =
		typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
	return typeof seed === "number" && Number.isSafeInteger(seed) && seed >= 0
		? seed
		: null;
}

/**
 * The song project the editor opens for a generation task, read from the run alone. The request
 * and its parameters are stored on the run, and nothing read here is among the fields the API
 * removes for a viewer who is not the task's owner. A run without a score has no project.
 */
export function taskRunToSongProject(
	run: Pick<TaskRunRecord, "id" | "payload" | "result">,
): SongProject | null {
	const score = taskRunScore(run);
	const modelId = taskRunModelId(run);
	if (score === null || modelId === null) return null;
	const data = taskData(run);
	const content = contentBlocks(data?.content);
	const parameters = asRecord(data?.parameters);
	return {
		style: roleText(content, "prompt") ?? "",
		lyrics: roleText(content, "lyrics") ?? "",
		score,
		scoreMode: parameters?.abc_mode === "melody" ? "melody" : "full",
		seed: seedOf(parameters?.seed),
		modelId,
		sourceKey: run.id,
	};
}

/** The song project the editor opens for a score file: only the score text is known. */
export function scoreFileProject(path: string, score: string): SongProject {
	return {
		style: "",
		lyrics: "",
		score,
		scoreMode: "full",
		seed: null,
		modelId: SCORE_FILE_DIALECT,
		sourceKey: path,
	};
}

export type ScoreEditorEntry = { taskRunId: string; modelId: string };

/**
 * Whether the song of a generation task opens in the score editor, and which task to open: the
 * task has finished, the model has a dialect (it is in `models`), and the request or the output
 * carries a score.
 */
export function scoreEditorEntry(
	run: Pick<TaskRunRecord, "id" | "taskType" | "status" | "payload" | "result">,
	models: ReadonlySet<string>,
): ScoreEditorEntry | null {
	if (run.taskType !== "generation" || run.status !== "completed") return null;
	const modelId = taskRunModelId(run);
	if (modelId === null || !models.has(modelId)) return null;
	return taskRunScore(run) === null ? null : { taskRunId: run.id, modelId };
}

type GenerationTurn = Pick<
	SessionTurnRecord,
	| "executionKind"
	| "status"
	| "model"
	| "meta"
	| "userContent"
	| "assistantContent"
>;

/** The JSON a direct-generation turn stores in its request or result message. */
function storedGenerationMessage(
	content: readonly ContentBlock[] | null,
	attachmentKind: "generation-input" | "generation-output",
): Record<string, unknown> | null {
	for (const block of content ?? []) {
		if (block.type !== "text" || block._meta?.attachmentKind !== attachmentKind)
			continue;
		try {
			return asRecord(JSON.parse(block.text));
		} catch {
			return null;
		}
	}
	return null;
}

/**
 * The entry for a result bubble in a create-mode chat, decided from the turn alone: the request
 * and the result are stored in it as messages, so no task needs fetching to know there is a score.
 */
export function generationTurnScoreEntry(
	turn: GenerationTurn,
	models: ReadonlySet<string>,
): ScoreEditorEntry | null {
	if (turn.executionKind !== "direct_generation" || turn.status !== "completed")
		return null;
	const taskRunId = turn.meta?.generationTaskId;
	if (typeof taskRunId !== "string" || !taskRunId) return null;
	const modelId = turn.model;
	if (!modelId || !models.has(modelId)) return null;
	const request = storedGenerationMessage(turn.userContent, "generation-input");
	const result = storedGenerationMessage(
		turn.assistantContent,
		"generation-output",
	);
	const hasScore =
		roleText(contentBlocks(result?.result), "abc") !== null ||
		roleText(contentBlocks(request?.content), "abc") !== null;
	return hasScore ? { taskRunId, modelId } : null;
}
