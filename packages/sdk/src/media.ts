import { type MediaFacts, type MediaFit, type MediaInfo, type MediaSize, type MediaVariantSize, imageVariantUrl, probeMediaInfo, probeVideoFrameSize, videoFrameUrl } from "@cohub/protocol/core";

export {
	type MediaFacts,
	type MediaFit,
	type MediaInfo,
	type MediaSize,
	type MediaSource,
	type MediaVariantSize,
	type VideoFrameOptions,
	fitsVideoFrames,
	imageVariantUrl,
	MEDIA_VARIANT_MAX,
	MEDIA_VARIANT_SIZES,
	mediaFacts,
	mediaInfoFromHeaders,
	mediaVariantSize,
	mergeMediaInfo,
	ossProcessUrl,
	probeMediaInfo,
	probeMediaSize,
	probeVideoFrameSize,
	variantSource,
	videoFrameUrl,
} from "@cohub/protocol/core";

export type MediaType = "image" | "video" | "audio";

export type ResolvedFile = { url: string; media?: MediaFacts };

export type MediaPreviewSource = {
	type: MediaType;
	url?: string | null;
	/** Provider cover or poster: art chosen for the work, so it ranks first. */
	previewUrl?: string | null;
	width?: number | null;
	height?: number | null;
};

/**
 * Preview images to try in order: the provider cover, a CDN frame of the
 * video, then its probed first frame. The CDN frame needs no request, so the
 * first paint never waits and a later probe never swaps the shown still.
 */
export function mediaPreviewCandidates(
	media: MediaPreviewSource,
	options: { size: MediaVariantSize; fit?: MediaFit },
	info?: Pick<MediaInfo, "firstFrameUrl">,
): string[] {
	const candidates: string[] = [];
	const add = (url: string | null | undefined) => {
		if (url && !candidates.includes(url)) candidates.push(url);
	};
	const addImage = (url: string | null | undefined) => {
		if (!url) return;
		add(imageVariantUrl(url, options.size, options.fit));
		add(url);
	};
	addImage(media.type === "image" ? media.url : media.previewUrl);
	if (media.type === "video" && media.url) {
		const natural = media.width && media.height ? { width: media.width, height: media.height } : null;
		add(videoFrameUrl(media.url, options.size, { fit: options.fit, natural }));
		addImage(info?.firstFrameUrl);
	}
	return candidates;
}

const INFO_CONCURRENCY = 4;
const INFO_LIMIT = 2_000;
const EMPTY_INFO_RETRY_MS = 60_000;

const infoCache = new Map<string, { info: MediaInfo; expiresAt: number }>();
const infoRequests = new Map<string, Promise<MediaInfo>>();
const infoWaiting: Array<() => void> = [];
let infoActive = 0;

export function cachedMediaInfo(url: string): MediaInfo | undefined {
	const entry = infoCache.get(url);
	if (!entry) return undefined;
	infoCache.delete(url);
	if (entry.expiresAt <= Date.now()) return undefined;
	infoCache.set(url, entry);
	return entry.info;
}

async function withInfoSlot<T>(run: () => Promise<T>): Promise<T> {
	if (infoActive < INFO_CONCURRENCY) infoActive += 1;
	else await new Promise<void>((resolve) => infoWaiting.push(resolve));
	try {
		return await run();
	} finally {
		const next = infoWaiting.shift();
		if (next) next();
		else infoActive -= 1;
	}
}

export function loadMediaInfo(url: string, type: MediaType): Promise<MediaInfo> {
	const hit = cachedMediaInfo(url);
	if (hit) return Promise.resolve(hit);
	let request = infoRequests.get(url);
	if (!request) {
		request = withInfoSlot(() => probeMediaInfo(url, { type }))
			.then((info) => {
				const empty = Object.keys(info).length === 0;
				infoCache.set(url, { info, expiresAt: empty ? Date.now() + EMPTY_INFO_RETRY_MS : Number.POSITIVE_INFINITY });
				if (infoCache.size > INFO_LIMIT) infoCache.delete(infoCache.keys().next().value as string);
				return info;
			})
			.finally(() => infoRequests.delete(url));
		infoRequests.set(url, request);
	}
	return request;
}

const sizeRequests = new Map<string, Promise<MediaSize | null>>();

export function loadMediaSize(url: string, type: "image" | "video"): Promise<MediaSize | null> {
	let request = sizeRequests.get(url);
	if (!request) {
		request = loadMediaInfo(url, type).then(async ({ width, height }) => {
			if (width && height) return { width, height };
			if (type !== "video") return null;
			const frame = await withInfoSlot(() => probeVideoFrameSize(url)).catch(() => ({}) as Partial<MediaSize>);
			return frame.width && frame.height ? { width: frame.width, height: frame.height } : null;
		});
		sizeRequests.set(url, request);
		if (sizeRequests.size > INFO_LIMIT) sizeRequests.delete(sizeRequests.keys().next().value as string);
		void request.then((size) => {
			if (!size && sizeRequests.get(url) === request) sizeRequests.delete(url);
		});
	}
	return request;
}
