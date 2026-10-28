import { stripSessionMarkdown, truncateSessionText } from "@cohub/protocol";
import type { SessionRecord } from "@neta-art/cohub";

function normalize(value: string) {
	return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function plainLatestMessage(session: SessionRecord, limit: number) {
	const raw = session.latestMessageText;
	return raw ? stripSessionMarkdown(raw.slice(0, limit * 4)) || null : null;
}

export function getSessionPreviewText(
	session: SessionRecord,
	limit = 96,
): string | null {
	const text = plainLatestMessage(session, limit);
	return text ? truncateSessionText(text, limit) : null;
}

export function getSessionPreview(
	session: SessionRecord,
	shownTitle: string | null = session.title,
	limit = 96,
): string | null {
	const title = shownTitle?.trim();
	if (!title) return null;
	const text = plainLatestMessage(session, limit);
	if (!text) return null;
	const shown = normalize(stripSessionMarkdown(title));
	return normalize(text).startsWith(shown)
		? null
		: truncateSessionText(text, limit);
}
