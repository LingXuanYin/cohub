import { asRecord, contentBlocks, taskData } from "@cohub/protocol";
import type { ContentBlock } from "@cohub/protocol/core";
import type { SessionTurnRecord } from "@cohub/protocol/model";
import type { AppMeta, TaskRunRecord } from "@neta-art/cohub";
import { generationOutputBlocks } from "$lib/resource-kit/task-run";

/** The `meta.role` that tags the ABC score of a song. */
const SCORE_ROLE = "abc";

/** A song output carries one score; the first non-blank abc text block is that score. */
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

/** The output's block first, then the request's: one precedence for both readers. */
function scoreSource(
	outputBlocks: readonly Record<string, unknown>[],
	requestBlocks: readonly Record<string, unknown>[],
): { text: string; outputBlock: number | null } | null {
	const output = roleBlock(outputBlocks, SCORE_ROLE);
	if (output) return { text: output.text, outputBlock: output.index };
	const requested = roleBlock(requestBlocks, SCORE_ROLE);
	return requested ? { text: requested.text, outputBlock: null } : null;
}

/** Whether an output block is a score text block, blank or not. */
export function isTaskScoreBlock(block: Record<string, unknown>): boolean {
	return block.type === "text" && asRecord(block.meta)?.role === SCORE_ROLE;
}

function taskRunScoreSource(
	run: Pick<TaskRunRecord, "taskType" | "payload" | "result">,
): { text: string; outputBlock: number | null } | null {
	return scoreSource(
		generationOutputBlocks(run),
		contentBlocks(taskData(run)?.content),
	);
}

/** The score of a song: what the run returned, else what the request carried. */
export function taskRunScore(
	run: Pick<TaskRunRecord, "taskType" | "payload" | "result">,
): string | null {
	return taskRunScoreSource(run)?.text ?? null;
}

export type TaskScoreEntry = { taskRunId: string; score: string };

export type TaskScoreItem = TaskScoreEntry & {
	/** The output block whose raw text the item replaces; `null` when only the request has it. */
	outputBlock: number | null;
};

/** The score item of a generation, with the block it replaces. */
export function taskScoreItem(
	run: Pick<TaskRunRecord, "id" | "taskType" | "payload" | "result">,
): TaskScoreItem | null {
	if (run.taskType !== "generation") return null;
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
	if (turn.executionKind !== "direct_generation") return null;
	const taskRunId = turn.meta?.generationTaskId;
	if (typeof taskRunId !== "string" || !taskRunId) return null;
	const request = storedGenerationMessage(turn.userContent, "generation-input");
	const result = storedGenerationMessage(
		turn.assistantContent,
		"generation-output",
	);
	const score = scoreSource(
		contentBlocks(result?.result),
		contentBlocks(request?.content),
	);
	return score === null ? null : { taskRunId, score: score.text };
}

export type ScoreEditorTarget = {
	appId: string;
	label: string;
	launch: { search?: string; hash?: string } | null;
	meta: AppMeta | null;
	/** False for a disabled App or one without published content. */
	available: boolean;
};

export type ScoreEditorDeps = {
	resolve: (
		ref: string,
		launch: { search: string },
	) => Promise<ScoreEditorTarget>;
	open: (target: ScoreEditorTarget) => Promise<boolean>;
	/** Called after the window opens, so the narrow layout can put it in front. */
	onOpened?: () => void;
};

export type ScoreOpenResult =
	| { ok: true }
	| { ok: false; unavailable: boolean; cause?: unknown };

/** The App is gone for this viewer, as opposed to unreachable right now. */
function isGone(cause: unknown) {
	const status = (cause as { status?: number } | null)?.status;
	return status === 403 || status === 404;
}

/** The launch parameters that tell the editor App which generation to open. */
export function scoreEditorLaunchSearch(taskRunId: string) {
	return `?${new URLSearchParams({ taskRun: taskRunId }).toString()}`;
}

/**
 * Resolves the editor App from the environment's ref and opens it for a generation. A ref that
 * is not configured, or an App that is gone or has no published content, opens nothing and
 * reports `unavailable`; transient failures keep the item so the next click retries.
 */
export async function openTaskScore(
	input: { taskRunId: string; ref: string | null | undefined },
	deps: ScoreEditorDeps,
): Promise<ScoreOpenResult> {
	const ref = input.ref?.trim();
	const taskRunId = input.taskRunId.trim();
	if (!ref || !taskRunId) return { ok: false, unavailable: true };
	try {
		const target = await deps.resolve(ref, {
			search: scoreEditorLaunchSearch(taskRunId),
		});
		if (!target.appId || !target.available) {
			return { ok: false, unavailable: true };
		}
		if (!(await deps.open(target))) {
			return { ok: false, unavailable: false };
		}
		deps.onOpened?.();
		return { ok: true };
	} catch (cause) {
		return { ok: false, unavailable: isGone(cause), cause };
	}
}
