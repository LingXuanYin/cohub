import type { SpaceModApps } from "@neta-art/cohub";
import { sdk } from "$lib/sdk";

/** After this, a cached list is still used and refreshed in the background. */
const MOUNTED_MODS_TTL_MS = 60 * 1_000;
const MAX_ENTRIES = 12;

type CacheEntry = { value: SpaceModApps[]; at: number };

const cache = new Map<string, CacheEntry>();
const requests = new Map<string, Promise<SpaceModApps[]>>();

function setCache(spaceId: string, value: SpaceModApps[]) {
	cache.delete(spaceId);
	cache.set(spaceId, { value, at: Date.now() });
	while (cache.size > MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest === undefined) break;
		cache.delete(oldest);
	}
}

function fetchMountedModApps(spaceId: string) {
	const pending = requests.get(spaceId);
	if (pending) return pending;
	const request = sdk
		.space(spaceId)
		.mods.listApps()
		.then(({ mods }) => {
			setCache(spaceId, mods);
			return mods;
		})
		.finally(() => {
			if (requests.get(spaceId) === request) requests.delete(spaceId);
		});
	requests.set(spaceId, request);
	return request;
}

/** Apps published by the Space of each mounted mod, cached per Space. */
export function readMountedModApps(
	spaceId: string,
	options: { refresh?: boolean } = {},
): Promise<SpaceModApps[]> {
	const cached = cache.get(spaceId);
	if (cached && !options.refresh) {
		if (Date.now() - cached.at >= MOUNTED_MODS_TTL_MS)
			void fetchMountedModApps(spaceId).catch(() => {});
		return Promise.resolve(cached.value);
	}
	return fetchMountedModApps(spaceId);
}

/** Drop a Space's list after this client changes its mounts. */
export function invalidateMountedModApps(spaceId: string) {
	cache.delete(spaceId);
	requests.delete(spaceId);
}
