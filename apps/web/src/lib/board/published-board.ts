import {
	type PublishedBoard,
	parsePublishedBoard,
} from "@neta-art/cohub/board";

const MAX_CACHED = 8;
const cache = new Map<string, Promise<PublishedBoard>>();

export function loadPublishedBoard(url: string): Promise<PublishedBoard> {
	let pending = cache.get(url);
	if (pending) {
		cache.delete(url);
		cache.set(url, pending);
		return pending;
	}
	pending = fetch(url).then(async (response) => {
		if (!response.ok)
			throw new Error(`Failed to load board (${response.status})`);
		return parsePublishedBoard(await response.json(), url);
	});
	pending.catch(() => cache.delete(url));
	cache.set(url, pending);
	if (cache.size > MAX_CACHED)
		cache.delete(cache.keys().next().value as string);
	return pending;
}
