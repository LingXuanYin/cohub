import { type MediaVariantSize, mediaVariantSize } from "@neta-art/cohub/media";

export function recordedSize(meta: Record<string, unknown> | undefined) {
	const { width, height } = meta ?? {};
	return typeof width === "number" && typeof height === "number"
		? { width, height }
		: {};
}

/** Variant size for `cssPixels` on this screen. */
export function screenVariantSize(cssPixels: number): MediaVariantSize {
	const ratio =
		typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
	return mediaVariantSize(cssPixels * Math.min(ratio, 3));
}
