import type { TaskRunRecord } from "@neta-art/cohub";

/**
 * Task-run records shaped like `GET /tasks/:id` for a song2 generation: the request sits in
 * `payload.data` (`content` blocks tagged with `meta.role`, plus `parameters`), the song and,
 * with `return_abc`, its score in `result.output`. Ids, users, URLs and the request texts are
 * placeholders.
 */

/** The score a song2 run returned for `return_abc` (a real output). */
export const returnedScore =
	'X:1\nT:\nM:4/4\nL:1/16\nQ:1/4=190\nV: Vocal clef=treble name="Vocal Melody" snm="Vocal"\nV: Ins clef=treble name="Ins Melody" snm="Inst."\nK:E\n% intro\nV: Vocal\nz12"A"e2e2|"A"b6b4e4f2-|"E/G#"f4g4z4e4|"F#m7"b6b4e2-"E/F#"e2f2-|\nV: Ins\nZ4|\nV: Vocal\n"E"f4g4z8|"A"z16|"E/G#"z16|"F#m7"z16|\nV: Ins\nz8b2c\'2d\'2e\'2|b\'6e\'6d\'4|b6e\'6d\'4|e\'6a4g4e2-|\nV: Vocal\n"E"z16|\nV: Ins\ne12-e2z2|\n% chorus\nV: Vocal\n"A"b12c\'4|"E/G#"b8z8|"F#m7"b12c\'4|"E"b8z8|\nV: Ins\nZ4|\nV: Vocal\n"A"b12c\'4|"E/G#"b6g6f4|"F#m7"e16-|"E"e8z8|\nV: Ins\nZ3|z12e2e2|\n% outro\nV: Vocal\n"A"z16|"E/G#"z16|"F#m7"z16|"E"z16|\nV: Ins\ne2B2e2b2B2e2b2B2|e2b2B2e2a2g2f2e2|e2B2e2b2B2e2b2B2|e2b2B2e2a2g2f2e2|\nV: Vocal\n"A"z16|"E/G#"z16|"F#m7"z16|"E"z16|\nV: Ins\ne2B2e2b2B2e2b2B2|e2b2B2e2a2g2f2e2|e6f6g4|a6g6f4|\nV: Vocal\n"E"z16|"E"z16|\nV: Ins\ne16-|e16|\n';

/** A short hand-written score, to tell apart from the returned one. */
export const requestedScore =
	'X:1\nT:\nM:4/4\nL:1/16\nQ:1/4=120\nV: Vocal clef=treble name="Vocal Melody" snm="Vocal"\nV: Ins clef=treble name="Ins Melody" snm="Inst."\nK:C\n% verse\nV: Vocal\n"C"c4d4e4f4|"G"g16|\nV: Ins\nc16|G16|\n';

export const STYLE = "bright J-pop, female vocal, piano";
export const LYRICS = "[verse]\nla la la\n\n[chorus]\nsing along";

const AUDIO_OUTPUT = {
	type: "audio",
	source: { type: "url", url: "https://media.example.test/song.mp3" },
	meta: { status: "succeeded", task_id: "provider-task" },
};

export type Song2RunOptions = {
	/** The `abc` text block sent with the request. */
	requestScore?: string;
	/** The `abc` text block returned with `return_abc`. */
	returnScore?: string;
	parameters?: Record<string, unknown>;
	content?: unknown[];
	output?: unknown[];
	model?: string;
	status?: TaskRunRecord["status"];
};

export const OWNER = "00000000-0000-4000-8000-0000000000a1";
export const VIEWER = "00000000-0000-4000-8000-0000000000b2";

/** A completed song2 run as its owner reads it. */
export function song2Run(options: Song2RunOptions = {}): TaskRunRecord {
	const model = options.model ?? "song2";
	const content = options.content ?? [
		{ type: "text", text: STYLE, meta: { role: "prompt" } },
		{ type: "text", text: LYRICS, meta: { role: "lyrics" } },
		...(options.requestScore === undefined
			? []
			: [{ type: "text", text: options.requestScore, meta: { role: "abc" } }]),
	];
	const output = options.output ?? [
		AUDIO_OUTPUT,
		...(options.returnScore === undefined
			? []
			: [{ type: "text", text: options.returnScore, meta: { role: "abc" } }]),
	];
	return {
		id: "run-song2",
		jobId: "job-song2",
		cronJobId: null,
		taskType: "generation",
		status: options.status ?? "completed",
		payload: {
			type: "generation",
			userId: OWNER,
			spaceId: "space-1",
			data: {
				model,
				content,
				parameters: options.parameters ?? { seed: 7, return_abc: true },
				modelDiscount: {
					multiplier: 0,
					resolvedAt: "2026-01-01T00:00:00.000Z",
				},
				requestSource: null,
			},
		},
		result: {
			cost: 0,
			model,
			output,
			billing: {
				status: "recorded",
				amountUsd: 0,
				usageType: "generation.music",
				officialCostUsd: 0,
				discountMultiplier: 0,
			},
			provider: "adapter",
			requestId: "request-1",
		},
		errorMessage: null,
		attemptCount: 0,
		spaceId: "space-1",
		sessionId: null,
		turnId: null,
		userUuid: OWNER,
		scheduledAt: null,
		startedAt: "2026-01-01T00:00:00.000Z",
		finishedAt: "2026-01-01T00:00:00.000Z",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

/**
 * The same run as the API serves it to someone else: the discount in the request and the billing
 * in the result are removed, nothing else (`sanitizeTaskRunPricingForViewer` in the API).
 */
export function readByAnotherMember(run: TaskRunRecord): TaskRunRecord {
	const payload = run.payload as { data: Record<string, unknown> };
	const { modelDiscount: _discount, ...data } = payload.data;
	const { billing: _billing, ...result } = run.result as Record<
		string,
		unknown
	>;
	return { ...run, payload: { ...payload, data }, result };
}
