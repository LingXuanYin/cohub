import { type Renderer, RendererType, type Texture } from "pixi.js";
import { imageVariantUrl, MEDIA_VARIANT_MAX, mediaVariantSize } from "../../media.js";
import { type BoardAssetSource, parseBoardMediaSource } from "../model/index.js";
import { type BoardBackdrop, type BoardBackdropImage, type BoardBackdropView, createBoardBackdropLayer } from "../render/index.js";
import { type BoardImageTexturePool, boardImageTexturePool } from "./texture-pool.js";

export type BoardBackdropStatus = { src: string; status: "loading" | "ready" | "error" };

const FADE_MS = 160;
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 32_000;

export function createBoardStageBackdrop(options: {
	renderer: Renderer;
	source: BoardAssetSource;
	pool?: BoardImageTexturePool;
	requestFrame: () => void;
	onStatus?: (status: BoardBackdropStatus | null) => void;
}) {
	const layer = createBoardBackdropLayer({ patterns: options.renderer.type === RendererType.WEBGL });
	const pool = options.pool ?? boardImageTexturePool;
	let loadKey: string | null = null;
	let file: string | null = null;
	let held: string | null = null;
	let texture: Texture | null = null;
	let readyAt = 0;
	let generation = 0;
	let retry: { key: string; delay: number; timer: ReturnType<typeof setTimeout> } | null = null;
	const reload = () => {
		loadKey = null;
		options.requestFrame();
	};
	const stopFiles = options.source.subscribe?.((path) => {
		if (path === file) reload();
	});

	function retryLater(key: string) {
		const delay = retry?.key === key ? retry.delay * 2 : RETRY_MIN_MS;
		stopRetry();
		if (delay <= RETRY_MAX_MS) retry = { key, delay, timer: setTimeout(reload, delay) };
	}

	function stopRetry() {
		if (retry) clearTimeout(retry.timer);
		retry = null;
	}

	function show(key: string | null, next: Texture | null) {
		if (held) void pool.release(held);
		if (next && !texture) readyAt = performance.now();
		held = key;
		texture = next;
	}

	function edgeFor(image: BoardBackdropImage, view: BoardBackdropView) {
		if (image.fit !== "repeat") return Math.max(view.width, view.height) * view.density;
		return image.tile ? Math.max(image.tile.width, image.tile.height) * view.density : Number.POSITIVE_INFINITY;
	}

	async function load(image: BoardBackdropImage, edge: number, current: number, attempt: string) {
		const report = (status: BoardBackdropStatus["status"]) => {
			if (current === generation) options.onStatus?.({ src: image.src, status });
		};
		report("loading");
		const source = parseBoardMediaSource(image.src);
		file = source?.kind === "file" ? source.value : null;
		const url = file ? await options.source.resolveFile(file).then((resolved) => resolved?.url ?? null, () => null) : image.src;
		if (current !== generation) return;
		const fit = image.fit === "cover" ? "cover" : "contain";
		const key = url && ((edge <= MEDIA_VARIANT_MAX && imageVariantUrl(url, mediaVariantSize(edge), fit)) || url);
		const loaded = key ? await pool.acquire(key).catch(() => null) : null;
		if (current !== generation) {
			if (key && loaded) void pool.release(key);
			return;
		}
		show(loaded ? key : null, loaded);
		report(loaded ? "ready" : "error");
		if (loaded) stopRetry();
		else retryLater(attempt);
		options.requestFrame();
	}

	return {
		container: layer.container,
		sync(backdrop: BoardBackdrop, view: BoardBackdropView, reducedMotion: boolean) {
			const next = backdrop.image ? `${backdrop.image.fit} ${backdrop.image.src}` : null;
			if (next !== loadKey) {
				loadKey = next;
				generation += 1;
				if (retry && retry.key !== next) stopRetry();
				if (backdrop.image && next) void load(backdrop.image, edgeFor(backdrop.image, view), generation, next);
				else {
					file = null;
					show(null, null);
					options.onStatus?.(null);
				}
			}
			const fade = reducedMotion ? 1 : Math.min(1, (performance.now() - readyAt) / FADE_MS);
			layer.sync(backdrop, view, texture, fade);
			if (texture && fade < 1) options.requestFrame();
		},
		destroy() {
			generation += 1;
			stopRetry();
			stopFiles?.();
			show(null, null);
			layer.destroy();
		},
	};
}
