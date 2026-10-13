import type { Card } from "./world";
import * as m from "./paraglide/messages.js";

export type Suggestion = {
	title: string;
	body: string;
	kind: Card["kind"];
	reason: string;
	basis: Card[];
};
export function suggestionsFor(card: Card, related: Card[]): Suggestion[] {
	const basis = [card, ...related.slice(0, 2)];
	const reason = m.record_reason({ name: card.title });
	return [
		{
			title: m.suggest_secret({ name: card.title }),
			body: m.suggest_secret_body(),
			kind: "clue",
			reason,
			basis,
		},
		{
			title: m.suggest_voice({ name: card.title }),
			body: m.suggest_voice_body(),
			kind: "story",
			reason,
			basis: [card],
		},
		{
			title: m.suggest_next({ name: card.title }),
			body: m.suggest_next_body(),
			kind: "idea",
			reason,
			basis,
		},
	];
}
