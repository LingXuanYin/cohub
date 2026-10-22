import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildGenerationRequestMessage,
	buildGenerationResultMessage,
	type GenerationContentBlock,
} from "@cohub/protocol/generation";
import { sanitizeTaskRunForList } from "@cohub/protocol/task";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { generationOutputBlocks } from "../lib/resource-kit/task-run";
import { loadScoreEditor, scoreModelIds } from "../lib/score-editor/dialects";
import { scoreEditorLanguage } from "../lib/score-editor/language";
import {
	generationTurnScoreEntry,
	scoreEditorEntry,
	taskRunScore,
	taskRunToSongProject,
	taskScoreItem,
} from "../lib/score-editor/song-project";
import {
	LYRICS,
	readByAnotherMember,
	requestedScore,
	returnedScore,
	STYLE,
	song2Run,
} from "./fixtures/song2-task-run";

test("the score is the returned abc text, byte for byte", () => {
	const run = song2Run({ returnScore: returnedScore });
	assert.equal(taskRunScore(run), returnedScore);
});

test("without a returned score the score is the one in the request", () => {
	const run = song2Run({
		requestScore: requestedScore,
		parameters: { seed: 7 },
	});
	assert.equal(taskRunScore(run), requestedScore);
});

test("the returned score is the one the song used, so it wins over the requested one", () => {
	const run = song2Run({
		requestScore: requestedScore,
		returnScore: returnedScore,
	});
	assert.equal(taskRunScore(run), returnedScore);
});

test("a song without any abc block has no score", () => {
	assert.equal(taskRunScore(song2Run()), null);
	assert.equal(
		taskRunScore(
			song2Run({
				requestScore: "  \n",
				returnScore: "",
			}),
		),
		null,
	);
});

test("only a block tagged with the abc role counts as the score", () => {
	const run = song2Run({
		content: [{ type: "text", text: requestedScore }],
		output: [
			{ type: "text", text: requestedScore, meta: { role: "lyrics" } },
			{ type: "audio", source: { type: "url", url: "https://x.test/a.mp3" } },
		],
	});
	assert.equal(taskRunScore(run), null);
});

test("a run becomes the song project the editor receives", () => {
	const run = song2Run({
		returnScore: returnedScore,
		parameters: { abc_mode: "melody", seed: 42, return_abc: true },
	});
	assert.deepEqual(taskRunToSongProject(run), {
		style: STYLE,
		lyrics: LYRICS,
		score: returnedScore,
		scoreMode: "melody",
		seed: 42,
		modelId: "song2",
		sourceKey: "run-song2",
	});
});

test("a request without abc_mode or seed gives the mode the model declares as its default and no seed", () => {
	const project = taskRunToSongProject(
		song2Run({ requestScore: requestedScore, parameters: {} }),
	);
	assert.equal(project?.scoreMode, "full");
	assert.equal(project?.seed, null);
	assert.equal(project?.score, requestedScore);
});

test("an abc_mode the editor does not know reads as full, a seed that is not a count reads as none", () => {
	for (const [parameters, seed] of [
		[{ abc_mode: "future-mode", seed: -1 }, null],
		[{ abc_mode: 3, seed: 1.5 }, null],
		[{ seed: "12" }, 12],
		[{ seed: Number.MAX_SAFE_INTEGER }, Number.MAX_SAFE_INTEGER],
		[{ seed: 2 ** 60 }, null],
		[{ seed: "x" }, null],
	] as const) {
		const project = taskRunToSongProject(
			song2Run({ requestScore: requestedScore, parameters }),
		);
		assert.equal(project?.scoreMode, "full");
		assert.equal(project?.seed, seed, JSON.stringify(parameters));
	}
});

test("a missing style or lyrics block reads as empty text for the editor to ask for", () => {
	const project = taskRunToSongProject(
		song2Run({
			content: [{ type: "text", text: requestedScore, meta: { role: "abc" } }],
		}),
	);
	assert.equal(project?.style, "");
	assert.equal(project?.lyrics, "");
	assert.equal(project?.score, requestedScore);
});

test("style and lyrics keep their line breaks and spacing", () => {
	const lyrics = "[verse]\n  la  la\n\n\n[chorus]\nsing\n";
	const project = taskRunToSongProject(
		song2Run({
			requestScore: requestedScore,
			content: [
				{ type: "text", text: " dreamy \n pop ", meta: { role: "prompt" } },
				{ type: "text", text: lyrics, meta: { role: "lyrics" } },
				{ type: "text", text: requestedScore, meta: { role: "abc" } },
			],
		}),
	);
	assert.equal(project?.style, " dreamy \n pop ");
	assert.equal(project?.lyrics, lyrics);
});

test("a run without a score has no song project", () => {
	assert.equal(taskRunToSongProject(song2Run()), null);
});

test("someone who is not the task's owner gets the same project: the request and parameters are still there", () => {
	const owner = song2Run({
		requestScore: requestedScore,
		returnScore: returnedScore,
		parameters: { abc_mode: "full", seed: 9, return_abc: true },
	});
	const other = readByAnotherMember(owner);
	assert.equal(
		(other.payload as { data: Record<string, unknown> }).data.modelDiscount,
		undefined,
	);
	assert.equal((other.result as Record<string, unknown>).billing, undefined);
	assert.deepEqual(taskRunToSongProject(other), taskRunToSongProject(owner));
	assert.equal(taskRunToSongProject(other)?.style, STYLE);
	assert.equal(taskRunToSongProject(other)?.seed, 9);
});

test("the list form of a run, which the side panel holds, gives the same project", () => {
	const run = song2Run({
		requestScore: requestedScore,
		returnScore: returnedScore,
	});
	assert.deepEqual(
		taskRunToSongProject(sanitizeTaskRunForList(run)),
		taskRunToSongProject(run),
	);
});

test("the editor's song2 dialect reads the returned score and the requested one", () => {
	for (const text of [returnedScore, requestedScore]) {
		const { score, diagnostics } = song2Dialect.parse(text);
		assert.deepEqual(diagnostics, []);
		assert.ok(score);
		assert.equal(score.truncation, null);
		assert.equal(song2Dialect.serialize(score), text);
	}
});

const models = scoreModelIds;

test("a finished song2 run with a returned score gets the entry", () => {
	const run = song2Run({ returnScore: returnedScore });
	assert.deepEqual(scoreEditorEntry(run, models), {
		taskRunId: "run-song2",
		modelId: "song2",
	});
});

test("the entry also appears when the score is only in the request", () => {
	const run = song2Run({
		requestScore: requestedScore,
		parameters: { seed: 7 },
	});
	assert.equal(scoreEditorEntry(run, models)?.taskRunId, "run-song2");
});

test("there is no entry for a song without a score", () => {
	assert.equal(scoreEditorEntry(song2Run(), models), null);
	assert.equal(
		scoreEditorEntry(song2Run({ parameters: { return_abc: false } }), models),
		null,
	);
});

test("there is no entry when no dialect is registered for the task's model", () => {
	const run = song2Run({
		model: "other-model",
		requestScore: requestedScore,
		returnScore: returnedScore,
	});
	assert.equal(scoreEditorEntry(run, models), null);
	assert.equal(
		scoreEditorEntry(song2Run({ returnScore: returnedScore }), new Set()),
		null,
	);
});

test("the entry waits for the song: no entry while the run is queued, running or failed", () => {
	for (const status of ["pending", "running", "failed"] as const) {
		const run = song2Run({ status, requestScore: requestedScore });
		assert.equal(scoreEditorEntry(run, models), null, status);
	}
});

test("only generation tasks get the entry", () => {
	const run = {
		...song2Run({ returnScore: returnedScore }),
		taskType: "run_command",
	};
	assert.equal(scoreEditorEntry(run, models), null);
});

test("the entry shows for the owner, another member and the side panel's list form alike", () => {
	const owner = song2Run({
		requestScore: requestedScore,
		returnScore: returnedScore,
	});
	const expected = { taskRunId: "run-song2", modelId: "song2" };
	for (const run of [
		owner,
		readByAnotherMember(owner),
		sanitizeTaskRunForList(owner),
	]) {
		assert.deepEqual(scoreEditorEntry(run, models), expected);
	}
});

const AUDIO = {
	type: "audio",
	source: { type: "url", url: "https://media.example.test/song.mp3" },
};

test("the item stands on the output block that holds the score, whichever place it has in the list", () => {
	const run = song2Run({
		output: [
			{ type: "text", text: "a revised prompt" },
			AUDIO,
			{ type: "text", text: "[verse]\nla", meta: { role: "lyrics" } },
			{ type: "text", text: returnedScore, meta: { role: "abc" } },
		],
	});
	const item = taskScoreItem(run, models);
	assert.equal(item?.outputBlock, 3);
	// The task detail lists these blocks, so the index has to address this very list.
	assert.equal(generationOutputBlocks(run)[3].text, returnedScore);
});

test("a score in both the request and the output: the item replaces the output's block", () => {
	const run = song2Run({
		requestScore: requestedScore,
		returnScore: returnedScore,
	});
	assert.equal(taskScoreItem(run, models)?.outputBlock, 1);
});

test("a score only in the request is an item with no output block to replace", () => {
	const run = song2Run({
		requestScore: requestedScore,
		parameters: { seed: 7 },
	});
	assert.deepEqual(taskScoreItem(run, models), {
		taskRunId: "run-song2",
		modelId: "song2",
		outputBlock: null,
	});
});

test("every other text block of the output stays: only a non-blank abc block is the score", () => {
	const run = song2Run({
		requestScore: requestedScore,
		output: [
			AUDIO,
			{ type: "text", text: "a revised prompt" },
			{ type: "text", text: returnedScore, meta: { role: "lyrics" } },
			{ type: "text", text: "  \n", meta: { role: "abc" } },
			{ type: "image", source: { type: "url", url: "https://x.test/c.png" } },
		],
	});
	// The blank abc block does not count, so the score is the request's and nothing is replaced.
	assert.equal(taskScoreItem(run, models)?.outputBlock, null);
	assert.equal(taskRunScore(run), requestedScore);
});

test("with two abc blocks the item replaces the one the editor opens and the other still shows", () => {
	const second = "X:1\nT:other\nK:C\nc16|\n";
	const run = song2Run({
		output: [
			AUDIO,
			{ type: "text", text: returnedScore, meta: { role: "abc" } },
			{ type: "text", text: second, meta: { role: "abc" } },
		],
	});
	assert.equal(taskScoreItem(run, models)?.outputBlock, 1);
	assert.equal(taskRunScore(run), returnedScore);
});

type Turn = Parameters<typeof generationTurnScoreEntry>[0];

/** A direct-generation turn the way the chat holds it: the request and the result as stored messages. */
function song2Turn(
	options: {
		requestScore?: string;
		returnScore?: string;
		model?: string;
		status?: Turn["status"];
	} = {},
): Turn {
	const model = options.model ?? "song2";
	const content: GenerationContentBlock[] = [
		{ type: "text", text: STYLE, meta: { role: "prompt" } },
		{ type: "text", text: LYRICS, meta: { role: "lyrics" } },
		...(options.requestScore === undefined
			? []
			: [
					{
						type: "text",
						text: options.requestScore,
						meta: { role: "abc" },
					} satisfies GenerationContentBlock,
				]),
	];
	const output = [
		{
			type: "audio",
			source: { type: "url", url: "https://media.example.test/song.mp3" },
		},
		...(options.returnScore === undefined
			? []
			: [{ type: "text", text: options.returnScore, meta: { role: "abc" } }]),
	];
	return {
		executionKind: "direct_generation",
		status: options.status ?? "completed",
		model,
		meta: { executionKind: "direct_generation", generationTaskId: "run-song2" },
		userContent: buildGenerationRequestMessage({
			taskId: "run-song2",
			model,
			parameters: { return_abc: true },
			content,
		}).content,
		assistantContent: buildGenerationResultMessage({
			taskId: "run-song2",
			model,
			status: "completed",
			result: output,
		}).content,
	};
}

test("a finished song2 turn whose result carries a score gets the entry, with its task", () => {
	assert.deepEqual(
		generationTurnScoreEntry(song2Turn({ returnScore: returnedScore }), models),
		{ taskRunId: "run-song2", modelId: "song2" },
	);
});

test("a finished song2 turn whose request carried the score gets the entry", () => {
	assert.equal(
		generationTurnScoreEntry(
			song2Turn({ requestScore: requestedScore }),
			models,
		)?.taskRunId,
		"run-song2",
	);
});

test("a turn gets no entry without a score, without a dialect or before it has finished", () => {
	assert.equal(generationTurnScoreEntry(song2Turn(), models), null);
	assert.equal(
		generationTurnScoreEntry(
			song2Turn({ model: "other-model", returnScore: returnedScore }),
			models,
		),
		null,
	);
	for (const status of ["queued", "running", "failed"] as const) {
		assert.equal(
			generationTurnScoreEntry(
				song2Turn({ returnScore: returnedScore, status }),
				models,
			),
			null,
			status,
		);
	}
});

test("an agent turn, a turn without its task id and unreadable message text get no entry", () => {
	const turn = song2Turn({ returnScore: returnedScore });
	assert.equal(
		generationTurnScoreEntry(
			{ ...turn, executionKind: "agent" as never },
			models,
		),
		null,
	);
	assert.equal(generationTurnScoreEntry({ ...turn, meta: null }, models), null);
	assert.equal(
		generationTurnScoreEntry(
			{
				...turn,
				userContent: [
					{
						type: "text",
						text: "{not json",
						_meta: { attachmentKind: "generation-input" },
					},
				],
				assistantContent: [
					{
						type: "text",
						text: "{not json",
						_meta: { attachmentKind: "generation-output" },
					},
				],
			},
			models,
		),
		null,
	);
	assert.equal(
		generationTurnScoreEntry({ ...turn, assistantContent: null }, models),
		null,
	);
});

test("the models that get an entry are the ones the editor mounts with a dialect", async () => {
	const { dialects } = await loadScoreEditor();
	for (const modelId of scoreModelIds) {
		assert.equal(dialects.find(modelId)?.id, modelId);
	}
	assert.equal(dialects.find("other-model"), undefined);
	assert.equal(dialects.find("song2"), song2Dialect);
});

test("the editor is loaded once, however often it is asked for", async () => {
	assert.equal(await loadScoreEditor(), await loadScoreEditor());
});

test("each interface locale maps to a language the editor ships", () => {
	assert.equal(scoreEditorLanguage("en"), "en");
	assert.equal(scoreEditorLanguage("zh-CN"), "zh");
});
