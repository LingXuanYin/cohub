import * as m from "./paraglide/messages.js";
import { getLocale } from "./paraglide/runtime.js";
import { kinds, type Card } from "./world";

export type Node = "start" | "crossroads" | "crypt" | "slope" | "bell" | "end";
export type Discovery =
	| {
			type: "card";
			entity: "ritual" | "crypt" | "acolyte" | "slope" | "bell" | "bellringer";
			card: Omit<Card, "id" | "sources">;
	  }
	| { type: "relation"; from: string; to: string; label: string }
	| { type: "scene" };
export type Turn = {
	id: string;
	input: string;
	speaker: string;
	text: string;
	node: Node;
	discoveries: Discovery[];
	prompt?: string;
	raw?: string;
	createdAt: string;
};
export type Run = {
	version: 1;
	id: string;
	workId: string;
	locale: "zh" | "en";
	node: Node;
	sources: Card[];
	turns: Turn[];
	applied: string[];
	revision: number;
};
export type Choice = {
	id: string;
	label: string;
	to: Node;
	reply: () => string;
	speaker: () => string;
	discover: () => Discovery[];
	keywords: string[];
};
const person = () => m.seed_elena_title();
const clue = (): Discovery => ({
	type: "card",
	entity: "ritual",
	card: { kind: "clue", title: m.clue_ritual(), body: m.clue_ritual_body() },
});
const crypt = (): Discovery[] => [
	{
		type: "card",
		entity: "crypt",
		card: {
			kind: "location",
			title: m.place_crypt(),
			body: m.place_crypt_body(),
			image: "art/crypt.webp",
		},
	},
	{
		type: "card",
		entity: "acolyte",
		card: {
			kind: "character",
			title: m.dialogue_guard(),
			body: m.guard_body(),
			image: "art/acolyte.webp",
		},
	},
];
const bell = (): Discovery[] => [
	{
		type: "card",
		entity: "bell",
		card: {
			kind: "location",
			title: m.place_bell(),
			body: m.place_bell_body(),
			image: "art/bell.webp",
		},
	},
	{
		type: "card",
		entity: "bellringer",
		card: {
			kind: "character",
			title: m.dialogue_bellringer(),
			body: m.bellringer_body(),
			image: "art/c-bellringer.webp",
		},
	},
];
export function choices(run: Run): Choice[] {
	const base = (
		id: string,
		label: string,
		to: Node,
		reply: () => string,
		discover: () => Discovery[],
		keywords: string[],
		speaker = person,
	): Choice => ({ id, label, to, reply, discover, keywords, speaker });
	switch (run.node) {
		case "start":
			return [
				base(
					"note",
					m.choice_note(),
					"crossroads",
					m.dialogue_note_line,
					() => [clue()],
					["纸", "三十七", "record", "paper", "thirty"],
				),
				base(
					"father",
					m.choice_father(),
					"crossroads",
					m.dialogue_father_line,
					() => [clue()],
					["爸", "父", "奥兰", "father", "oran"],
				),
			];
		case "crossroads":
			return [
				base(
					"crypt",
					m.choice_crypt(),
					"crypt",
					m.dialogue_crypt_line,
					crypt,
					["地窖", "门", "crypt", "door"],
					m.dialogue_guard,
				),
				base(
					"bell",
					m.choice_bell(),
					"bell",
					m.dialogue_bell_line,
					bell,
					["钟楼", "钟", "bell", "tower"],
					m.dialogue_bellringer,
				),
			];
		case "crypt":
			return [
				base(
					"show",
					m.choice_show(),
					"slope",
					m.dialogue_slope_line,
					() => [
						{
							type: "card",
							entity: "slope",
							card: {
								kind: "location",
								title: m.place_slope(),
								body: m.place_slope_body(),
								image: "art/underground.webp",
							},
						},
						{
							type: "relation",
							from: "acolyte",
							to: "hero",
							label: m.relationship_help(),
						},
					],
					["纸", "线索", "三十七", "show", "clue", "paper"],
				),
				base(
					"back",
					m.choice_back(),
					"end",
					m.dialogue_end_line,
					() => [{ type: "scene" }],
					["回", "中殿", "back", "nave"],
					m.dialogue_narrator,
				),
			];
		case "bell":
			return [
				base(
					"listen",
					m.choice_listen(),
					"end",
					m.dialogue_end_line,
					() => [
						{
							type: "relation",
							from: "bellringer",
							to: "hero",
							label: m.relationship_met(),
						},
						{ type: "scene" },
					],
					["听", "心", "listen", "heart"],
					m.dialogue_narrator,
				),
				base(
					"finish",
					m.choice_finish(),
					"end",
					m.dialogue_end_line,
					() => [{ type: "scene" }],
					["回", "祭坛", "back", "altar"],
					m.dialogue_narrator,
				),
			];
		case "slope":
			return [
				base(
					"finish",
					m.choice_finish(),
					"end",
					m.dialogue_end_line,
					() => [{ type: "scene" }],
					["回", "祭坛", "back", "altar"],
					m.dialogue_narrator,
				),
			];
		case "end":
			return [];
	}
}
export function startRun(
	workId: string,
	sources: Card[],
	id: string = crypto.randomUUID(),
): Run {
	return {
		version: 1,
		id,
		workId,
		locale: getLocale(),
		node: "start",
		sources: structuredClone(sources),
		applied: [],
		revision: 0,
		turns: [
			{
				id: `${id}-0`,
				input: "",
				speaker: m.dialogue_narrator(),
				text: m.dialogue_start_line(),
				node: "start",
				discoveries: [],
				createdAt: new Date().toISOString(),
			},
		],
	};
}
export function advance(run: Run, choiceId: string, input?: string): Run {
	const option = choices(run).find((choice) => choice.id === choiceId);
	if (!option)
		throw new Error("This conversation choice is no longer available.");
	const turn: Turn = {
		id: `${run.id}-${run.turns.length}`,
		input: input ?? option.label,
		speaker: option.speaker(),
		text:
			run.node === "start"
				? `${option.reply()}\n\n${m.dialogue_marcus_line()}`
				: option.reply(),
		node: option.to,
		discoveries: option.discover(),
		createdAt: new Date().toISOString(),
	};
	return {
		...run,
		node: option.to,
		turns: [...run.turns, turn],
		revision: run.revision + 1,
	};
}
export function matchChoice(run: Run, input: string): Choice | undefined {
	const text = input.toLowerCase();
	return choices(run).find((choice) =>
		choice.keywords.some((keyword) => text.includes(keyword)),
	);
}
export function speakerFor(node: Node): string {
	return node === "crypt" || node === "slope"
		? m.dialogue_guard()
		: node === "bell"
			? m.dialogue_bellringer()
			: m.seed_elena_title();
}
export function reply(
	run: Run,
	input: string,
	result?: { text: string; raw: string; prompt: string },
): Run {
	if (run.node === "end") throw new Error("This conversation run is complete.");
	const turn: Turn = {
		id: `${run.id}-${run.turns.length}`,
		input,
		speaker: speakerFor(run.node),
		text: result?.text ?? m.dialogue_miss(),
		node: run.node,
		discoveries: [],
		raw: result?.raw,
		prompt: result?.prompt,
		createdAt: new Date().toISOString(),
	};
	return { ...run, turns: [...run.turns, turn], revision: run.revision + 1 };
}
export function entityId(workId: string, entity: string) {
	return `${workId}-${entity}`;
}
export function parseRun(value: unknown, workId: string): Run {
	if (!value || typeof value !== "object")
		throw new Error("Invalid conversation run.");
	const run = value as Run;
	const nodes: Node[] = [
		"start",
		"crossroads",
		"crypt",
		"slope",
		"bell",
		"end",
	];
	if (
		run.version !== 1 ||
		run.workId !== workId ||
		typeof run.id !== "string" ||
		!nodes.includes(run.node) ||
		!Array.isArray(run.turns) ||
		!Array.isArray(run.sources) ||
		!Array.isArray(run.applied) ||
		!Number.isInteger(run.revision)
	)
		throw new Error("Invalid conversation run.");
	if (
		(run.locale !== "zh" && run.locale !== "en") ||
		run.revision < 0 ||
		!run.applied.every((id) => typeof id === "string") ||
		!run.sources.every(
			(source) =>
				source &&
				typeof source.id === "string" &&
				typeof source.title === "string" &&
				typeof source.body === "string" &&
				kinds.includes(source.kind),
		)
	)
		throw new Error("Invalid conversation sources.");
	const ids = new Set<string>();
	for (const turn of run.turns) {
		if (
			!turn ||
			typeof turn.id !== "string" ||
			typeof turn.input !== "string" ||
			typeof turn.text !== "string" ||
			typeof turn.speaker !== "string" ||
			!nodes.includes(turn.node) ||
			!Array.isArray(turn.discoveries)
		)
			throw new Error("Invalid conversation turn.");
		if (ids.has(turn.id) || typeof turn.createdAt !== "string")
			throw new Error("Invalid conversation turn identity.");
		ids.add(turn.id);
		for (const event of turn.discoveries) {
			if (!event || !["card", "relation", "scene"].includes(event.type))
				throw new Error("Invalid discovery event.");
			if (
				event.type === "card" &&
				(![
					"ritual",
					"crypt",
					"acolyte",
					"slope",
					"bell",
					"bellringer",
				].includes(event.entity) ||
					!event.card ||
					typeof event.card.title !== "string" ||
					typeof event.card.body !== "string" ||
					!kinds.includes(event.card.kind))
			)
				throw new Error("Invalid discovery card.");
			if (
				event.type === "relation" &&
				(!["acolyte", "bellringer"].includes(event.from) ||
					event.to !== "hero" ||
					typeof event.label !== "string")
			)
				throw new Error("Invalid relation event.");
		}
	}
	return run;
}
