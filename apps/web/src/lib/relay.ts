import {
	readSessionTurnOrigin,
	readSessionTurnRelay,
	splitLeadingSpaceMention,
} from "@cohub/protocol/model";
import { buildSpaceMentionMarkdown } from "$lib/mentions/space";

export type RelayTarget = {
	spaceId: string;
	sessionId?: string;
	label: string;
};

export function readRelayTarget(
	text: string,
	current: { spaceId: string | null; sessionId: string | null },
): RelayTarget | null {
	const leading = splitLeadingSpaceMention(text);
	if (
		!leading ||
		(leading.spaceId === current.spaceId &&
			(!leading.sessionId || leading.sessionId === current.sessionId))
	)
		return null;
	return {
		spaceId: leading.spaceId,
		...(leading.sessionId ? { sessionId: leading.sessionId } : {}),
		label: leading.label,
	};
}

export function withRelayTarget(text: string, target: RelayTarget): string {
	const rest = splitLeadingSpaceMention(text)?.rest ?? text.replace(/^\s+/, "");
	return `${buildSpaceMentionMarkdown(target)} ${rest}`;
}

export const isRelayExchange = (turn: { meta?: unknown } | null | undefined) =>
	readSessionTurnOrigin(turn?.meta)?.kind === "reply" ||
	readSessionTurnRelay(turn?.meta) !== null;
