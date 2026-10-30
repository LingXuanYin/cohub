import { DOMAdapter, type Texture } from "pixi.js";

export const BOARD_CUTOUT_SAMPLE = 8;

export function isBoardCutout(data: ArrayLike<number>, size = BOARD_CUTOUT_SAMPLE): boolean {
	let border = 0;
	let clear = 0;
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			if (x > 0 && y > 0 && x < size - 1 && y < size - 1) continue;
			border++;
			if ((data[(y * size + x) * 4 + 3] ?? 255) < 128) clear++;
		}
	return clear * 2 >= border;
}

const cutouts = new WeakMap<object, boolean>();

export function textureIsCutout(texture: Texture | null | undefined): boolean {
	const resource = texture?.source.resource as object | undefined;
	if (!resource || typeof resource !== "object") return false;
	let cutout = cutouts.get(resource);
	if (cutout !== undefined) return cutout;
	cutout = false;
	try {
		const canvas = DOMAdapter.get().createCanvas(BOARD_CUTOUT_SAMPLE, BOARD_CUTOUT_SAMPLE);
		const context = canvas.getContext("2d") as CanvasRenderingContext2D | null;
		if (context) {
			context.drawImage(resource as CanvasImageSource, 0, 0, BOARD_CUTOUT_SAMPLE, BOARD_CUTOUT_SAMPLE);
			cutout = isBoardCutout(context.getImageData(0, 0, BOARD_CUTOUT_SAMPLE, BOARD_CUTOUT_SAMPLE).data);
		}
	} catch {
	}
	cutouts.set(resource, cutout);
	return cutout;
}
