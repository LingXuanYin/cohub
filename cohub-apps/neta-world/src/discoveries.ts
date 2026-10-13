import {
	createDocumentLayout,
	type BoardDocument,
	type BoardPatch,
	type Rect,
} from "@neta-art/cohub/board";
import { cardPatch, cardOf, cards, cardSnapshot, type Card } from "./world";
import { entityId, type Run, type Turn } from "./conversation";
import * as m from "./paraglide/messages.js";

export function discoveryPatch(
	document: BoardDocument,
	run: Run,
	turn: Turn,
	origin: Rect,
): BoardPatch | null {
	const owner = document.items[run.workId];
	if (!owner || !cardOf(run.workId, owner))
		throw new Error("The conversation work no longer exists.");
	const receipts = owner.metadata?.netaApplied;
	if (
		receipts &&
		typeof receipts === "object" &&
		!Array.isArray(receipts) &&
		turn.id in receipts
	)
		return null;
	const items: NonNullable<BoardPatch["items"]> = {};
	const group = entityId(run.workId, "discoveries");
	const prior = document.items[group];
	let count = cards(document).filter((card) =>
		card.sources.includes(run.workId),
	).length;
	const added: string[] = [];
	const writeCard = (card: Card) => {
		if (document.items[card.id] || items[card.id]) return;
		const x = (count % 2) * 280 + 24;
		const y = Math.floor(count / 2) * 360 + 72;
		const patch = cardPatch(card, { x, y });
		const root = patch.items?.[card.id];
		if (root && typeof root === "object") root.parent = group;
		Object.assign(items, patch.items);
		added.push(card.id);
		count++;
	};
	for (const event of turn.discoveries) {
		if (event.type === "card")
			writeCard({
				...event.card,
				id: entityId(run.workId, event.entity),
				sources: [run.workId],
				sourceSnapshots: run.sources.map(cardSnapshot),
				createdAt: turn.createdAt,
			});
		if (event.type === "scene") {
			const cast = [
				...run.sources
					.filter((source) => source.kind === "character")
					.map((source) => source.id),
				...["acolyte", "bellringer"]
					.map((entity) => entityId(run.workId, entity))
					.filter((id) => document.items[id] || items[id]),
			];
			const id = entityId(run.workId, "scene");
			writeCard({
				id,
				kind: "story",
				title: m.scene_title(),
				body: m.scene_body(),
				image: "art/cathedral.webp",
				sources: [run.workId],
				sourceSnapshots: run.sources.map(cardSnapshot),
				work: {
					type: "scene",
					cast,
					location:
						run.sources.find((source) => source.kind === "location")?.id ??
						run.workId,
					runId: run.id,
					sources: [run.workId, ...cast],
				},
			});
		}
		if (event.type === "relation") {
			const resolve = (id: string) => {
				if (id === "hero")
					return (
						run.sources.find((source) => source.id === "hero")?.id ??
						run.sources.find((source) => source.kind === "character")?.id
					);
				return entityId(run.workId, id);
			};
			const from = resolve(event.from),
				to = resolve(event.to);
			if (
				from &&
				to &&
				(document.items[from] || items[from]) &&
				(document.items[to] || items[to])
			) {
				const id = entityId(run.workId, `relation-${event.from}-${event.to}`);
				if (!document.items[id])
					items[id] = {
						type: "arrow",
						z: -1,
						props: {
							start: { item: from },
							end: { item: to },
							label: event.label,
							bend: 0.12,
						},
						style: { stroke: "#87927d", strokeWidth: 1.5 },
						metadata: { sourceTurn: turn.id, runId: run.id },
					};
			}
		}
	}
	const layout = createDocumentLayout(document.items);
	const rightEdge = Math.max(
		origin.x + origin.width,
		...Object.keys(document.items)
			.filter((id) => Boolean(document.items[id]?.metadata?.neta))
			.map((id) => {
				const r = layout.bounds(id);
				return r.x + r.width;
			}),
	);
	if (count) {
		const height = Math.ceil(count / 2) * 360 + 96;
		items[group] = prior
			? {
					size: {
						height: Math.max(
							prior.type === "frame" ? prior.size.height : 0,
							height,
						),
					},
				}
			: {
					type: "frame",
					position: { x: rightEdge + 100, y: origin.y },
					size: { width: 588, height },
					z: 0,
					props: { decoration: "frame", clip: false, label: m.scene_group() },
					style: { stroke: "#87927d", fillOpacity: 0.03 },
					metadata: { conversationWork: run.workId },
				};
	}
	items[run.workId] = {
		metadata: {
			netaApplied: {
				[turn.id]: { runId: run.id, outputs: added, at: turn.createdAt },
			},
		},
	};
	return { items };
}
export function conversationCard(
	sources: Card[],
	id: string = crypto.randomUUID(),
): Card {
	return {
		id,
		kind: "story",
		title: m.dialogue_title(),
		body: m.dialogue_body(),
		image: "art/cathedral.webp",
		sources: sources.map((source) => source.id),
		sourceSnapshots: sources.map(cardSnapshot),
		createdAt: new Date().toISOString(),
		work: {
			type: "conversation",
			scenario: "midnight",
			sources: sources.map((source) => source.id),
		},
		creation: {
			question: m.build_dialogue(),
			explanation: m.dialogue_intro(),
			basis: sources.map(cardSnapshot),
			outputs: [id],
		},
	};
}
