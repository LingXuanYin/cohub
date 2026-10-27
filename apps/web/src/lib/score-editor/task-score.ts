import {
	asRecord,
	contentBlocks,
	generationOutput,
	taskData,
} from "@cohub/protocol";
import type { ContentBlock } from "@cohub/protocol/core";
import type { SessionTurnRecord } from "@cohub/protocol/model";
import type { AppMeta, TaskRunRecord } from "@neta-art/cohub";

type RunPayloads = { payload?: unknown; result?: unknown };

/** The `meta.role` that tags the ABC score of a song. */
const SCORE_ROLE = "abc";

function roleBlock(
	blocks: readonly Record<string, unknown>[],
	role: string,
): { index: number; text: string } | null {
	const index = blocks.findIndex(
		(block) =>
			block.type === "text" &&
			asRecord(block.meta)?.role === role &&
			typeof block.text === "string" &&
			block.text.trim() !== "",
	);
	if (index < 0) return null;
	const text = blocks[index]?.text;
	return typeof text === "string" ? { index, text } : null;
}

function roleText(
	blocks: readonly Record<string, unknown>[],
	role: string,
): string | null {
	return roleBlock(blocks, role)?.text ?? null;
}

/** Where the score is: the output block that holds it, else the request's (`null`). */
function taskRunScoreSource(
	run: RunPayloads,
): { text: string; outputBlock: number | null } | null {
	const output = roleBlock(generationOutput(run), SCORE_ROLE);
	if (output) return { text: output.text, outputBlock: output.index };
	const requested = roleText(contentBlocks(taskData(run)?.content), SCORE_ROLE);
	return requested === null ? null : { text: requested, outputBlock: null };
}

/** The score of a song: what the run returned, else what the request carried. */
export function taskRunScore(run: RunPayloads): string | null {
	return taskRunScoreSource(run)?.text ?? null;
}

export type TaskScoreEntry = { taskRunId: string; score: string };

export type TaskScoreItem = TaskScoreEntry & {
	/** The output block whose raw text the item replaces; `null` when only the request has it. */
	outputBlock: number | null;
};

/** The score item of a finished generation, with the block it replaces. */
export function taskScoreItem(
	run: Pick<TaskRunRecord, "id" | "taskType" | "status" | "payload" | "result">,
): TaskScoreItem | null {
	if (run.taskType !== "generation" || run.status !== "completed") return null;
	const source = taskRunScoreSource(run);
	return source
		? {
				taskRunId: run.id,
				score: source.text,
				outputBlock: source.outputBlock,
			}
		: null;
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
 * The score entry of a create-mode result bubble, decided from the turn alone: the request and
 * the result are stored in it as messages, so no task needs fetching to know there is a score.
 */
export function generationTurnScoreItem(
	turn: GenerationTurn,
): TaskScoreEntry | null {
	if (turn.executionKind !== "direct_generation" || turn.status !== "completed")
		return null;
	const taskRunId = turn.meta?.generationTaskId;
	if (typeof taskRunId !== "string" || !taskRunId) return null;
	const request = storedGenerationMessage(turn.userContent, "generation-input");
	const result = storedGenerationMessage(turn.assistantContent, "generation-output");
	const score =
		roleText(contentBlocks(result?.result), SCORE_ROLE) ??
		roleText(contentBlocks(request?.content), SCORE_ROLE);
	return score === null ? null : { taskRunId, score };
}

export type ScoreEditorTarget = {
	appId: string;
	label: string;
	launch: { search?: string; hash?: string } | null;
	meta: AppMeta | null;
};

export type ScoreEditorDeps = {
	resolve: (
		ref: string,
		launch: { search: string },
	) => Promise<ScoreEditorTarget>;
	open: (target: ScoreEditorTarget) => Promise<boolean>;
};

/** The launch parameters that tell the editor App which generation to open. */
export function scoreEditorLaunchSearch(taskRunId: string) {
	return new URLSearchParams({ taskRun: taskRunId }).toString();
}

/**
 * Resolves the editor App from the environment's ref and opens it for a generation. A ref that
 * is not configured or no longer resolves opens nothing and returns `false`, so the caller can
 * keep showing the score text.
 */
export async function openTaskScore(
	input: { taskRunId: string; ref: string | null | undefined },
	deps: ScoreEditorDeps,
): Promise<boolean> {
	const ref = input.ref?.trim();
	const taskRunId = input.taskRunId.trim();
	if (!ref || !taskRunId) return false;
	try {
		const target = await deps.resolve(ref, {
			search: scoreEditorLaunchSearch(taskRunId),
		});
		if (!target.appId) return false;
		return await deps.open(target);
	} catch {
		return false;
	}
}
