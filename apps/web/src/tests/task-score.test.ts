import assert from "node:assert/strict";
import { test } from "node:test";
import { generationOutput } from "@cohub/protocol";
import {
	buildGenerationRequestMessage,
	buildGenerationResultMessage,
} from "@cohub/protocol/generation";
import {
	generationTurnScoreItem,
	isTaskScoreBlock,
	openTaskScore,
	type ScoreEditorDeps,
	type ScoreEditorTarget,
	taskRunScore,
	taskScoreItem,
} from "../lib/score-editor/task-score.ts";
import {
	AUDIO,
	requestedScore,
	returnedScore,
	scoreRun,
} from "./fixtures/generation-score-run.ts";

test("the returned score wins over the one the request carried", () => {
	const run = scoreRun({
		requestScore: requestedScore,
		returnScore: returnedScore,
	});
	assert.equal(taskRunScore(run), returnedScore);
});

test("without a returned score the request's score is the one", () => {
	assert.equal(
		taskRunScore(scoreRun({ requestScore: requestedScore })),
		requestedScore,
	);
});

test("a run without an abc block has no score", () => {
	assert.equal(taskRunScore(scoreRun()), null);
	assert.equal(
		taskRunScore(scoreRun({ requestScore: "  \n", returnScore: "" })),
		null,
	);
});

test("only a non-blank text block tagged abc counts", () => {
	const run = scoreRun({
		content: [{ type: "text", text: requestedScore }],
		output: [{ type: "text", text: requestedScore, meta: { role: "lyrics" } }],
	});
	assert.equal(taskRunScore(run), null);
});

test("the item replaces the output block that holds the score", () => {
	const run = scoreRun({
		requestScore: requestedScore,
		returnScore: returnedScore,
		output: [
			AUDIO,
			{ type: "text", text: "a revised prompt" },
			{ type: "text", text: returnedScore, meta: { role: "abc" } },
		],
	});
	assert.equal(generationOutput(run)[2].text, returnedScore);
	assert.deepEqual(taskScoreItem(run), {
		taskRunId: "run-score",
		score: returnedScore,
		outputBlock: 2,
	});
});

test("a score only in the request gets an item that replaces no output block", () => {
	assert.deepEqual(taskScoreItem(scoreRun({ requestScore: requestedScore })), {
		taskRunId: "run-score",
		score: requestedScore,
		outputBlock: null,
	});
});

test("the item does not wait for the generation to finish", () => {
	for (const status of ["pending", "running", "failed"] as const) {
		assert.deepEqual(
			taskScoreItem(scoreRun({ status, requestScore: requestedScore })),
			{
				taskRunId: "run-score",
				score: requestedScore,
				outputBlock: null,
			},
			status,
		);
	}
	assert.equal(
		taskScoreItem({
			...scoreRun({ returnScore: returnedScore }),
			taskType: "run_command",
		}),
		null,
	);
});

type Turn = Parameters<typeof generationTurnScoreItem>[0];

function scoreTurn(
	options: {
		requestScore?: string;
		returnScore?: string;
		status?: "queued" | "running" | "completed" | "failed";
	} = {},
): Turn {
	const content = [
		...(options.requestScore === undefined
			? []
			: [
					{
						type: "text" as const,
						text: options.requestScore,
						meta: { role: "abc" },
					},
				]),
	];
	const output = [
		AUDIO,
		...(options.returnScore === undefined
			? []
			: [
					{
						type: "text" as const,
						text: options.returnScore,
						meta: { role: "abc" },
					},
				]),
	];
	return {
		executionKind: "direct_generation",
		status: options.status ?? "completed",
		model: "song2",
		meta: { executionKind: "direct_generation", generationTaskId: "run-score" },
		userContent: buildGenerationRequestMessage({
			taskId: "run-score",
			model: "song2",
			content,
		}).content,
		assistantContent: buildGenerationResultMessage({
			taskId: "run-score",
			model: "song2",
			status: options.status ?? "completed",
			result: output,
		}).content,
	};
}

test("a create-mode result bubble whose result carries a score gets the task", () => {
	assert.deepEqual(
		generationTurnScoreItem(
			scoreTurn({ requestScore: requestedScore, returnScore: returnedScore }),
		),
		{ taskRunId: "run-score", score: returnedScore },
	);
});

test("a create-mode bubble keeps the input score while the turn runs", () => {
	assert.equal(generationTurnScoreItem(scoreTurn()), null);
	assert.deepEqual(
		generationTurnScoreItem(scoreTurn({ requestScore: requestedScore })),
		{ taskRunId: "run-score", score: requestedScore },
	);
	for (const status of ["queued", "running", "failed"] as const) {
		assert.deepEqual(
			generationTurnScoreItem(
				scoreTurn({ status, requestScore: requestedScore }),
			),
			{ taskRunId: "run-score", score: requestedScore },
			status,
		);
	}
});

test("the item opens the editor App with the task id in the launch parameters", async () => {
	const calls: ScoreEditorTarget[] = [];
	const deps: ScoreEditorDeps = {
		resolve: async (ref, launch) => {
			assert.equal(ref, "base/mod/editor");
			assert.deepEqual(launch, { search: "?taskRun=run-score" });
			return {
				appId: "app-1",
				label: "Editor",
				launch,
				meta: null,
				available: true,
			};
		},
		open: async (target) => {
			calls.push(target);
			return true;
		},
	};
	assert.deepEqual(
		await openTaskScore(
			{ taskRunId: "run-score", ref: "base/mod/editor" },
			deps,
		),
		{ ok: true },
	);
	assert.deepEqual(calls, [
		{
			appId: "app-1",
			label: "Editor",
			launch: { search: "?taskRun=run-score" },
			meta: null,
			available: true,
		},
	]);
});

test("an unavailable target opens nothing and returns false", async () => {
	let opened = 0;
	const deps: ScoreEditorDeps = {
		resolve: async (_ref, launch) => ({
			appId: "app-1",
			label: "Editor",
			launch,
			meta: null,
			available: false,
		}),
		open: async () => {
			opened += 1;
			return true;
		},
	};
	const result = await openTaskScore(
		{ taskRunId: "run-score", ref: "base/mod/editor" },
		deps,
	);
	assert.equal(result.ok, false);
	assert.equal(result.unavailable, true);
	assert.equal(opened, 0);
});

test("a ref that resolves to nothing falls back without an error or a second open", async () => {
	let opened = 0;
	const deps: ScoreEditorDeps = {
		resolve: async () => {
			throw Object.assign(new Error("not found"), { status: 404 });
		},
		open: async () => {
			opened += 1;
			return true;
		},
	};
	const result = await openTaskScore(
		{ taskRunId: "run-score", ref: "base/mod/editor" },
		deps,
	);
	assert.equal(result.ok, false);
	assert.equal(result.unavailable, true);
	assert.equal(opened, 0);
});

test("a network failure keeps the item so the next click retries", async () => {
	const deps: ScoreEditorDeps = {
		resolve: async () => {
			throw Object.assign(new Error("offline"), { status: 503 });
		},
		open: async () => true,
	};
	const result = await openTaskScore(
		{ taskRunId: "run-score", ref: "base/mod/editor" },
		deps,
	);
	assert.equal(result.ok, false);
	assert.equal(result.unavailable, false);
});

test("a failed open keeps the item so the next click retries", async () => {
	const deps: ScoreEditorDeps = {
		resolve: async (_ref, launch) => ({
			appId: "app-1",
			label: "Editor",
			launch,
			meta: null,
			available: true,
		}),
		open: async () => false,
	};
	const result = await openTaskScore(
		{ taskRunId: "run-score", ref: "base/mod/editor" },
		deps,
	);
	assert.equal(result.ok, false);
	assert.equal(result.unavailable, false);
});

test("without a configured ref nothing is resolved or opened", async () => {
	let resolved = 0;
	const deps: ScoreEditorDeps = {
		resolve: async () => {
			resolved += 1;
			throw new Error("must not resolve");
		},
		open: async () => false,
	};
	for (const ref of [undefined, null, "", "  "]) {
		const result = await openTaskScore({ taskRunId: "run-score", ref }, deps);
		assert.equal(result.ok, false);
		assert.equal(result.unavailable, true);
	}
	assert.equal(resolved, 0);
});

test("every abc text block of an output is a score block, blank or not", () => {
	assert.equal(
		isTaskScoreBlock({
			type: "text",
			text: returnedScore,
			meta: { role: "abc" },
		}),
		true,
	);
	assert.equal(
		isTaskScoreBlock({ type: "text", text: "  \n", meta: { role: "abc" } }),
		true,
	);
	assert.equal(
		isTaskScoreBlock({ type: "text", text: "la", meta: { role: "lyrics" } }),
		false,
	);
	assert.equal(isTaskScoreBlock({ type: "audio" }), false);
});
