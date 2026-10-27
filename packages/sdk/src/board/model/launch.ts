import { BOARD_ID_MAX_LENGTH } from "@cohub/protocol/board-model";
import { type BoardCameraState, clampZoom } from "./geometry.js";

/** `#focus=<itemId>`, `#view=<centerX>,<centerY>,<zoom>`, `#play=<animationId>&t=<ms>`. */
export type BoardLaunch = {
	focus?: string;
	view?: BoardCameraState;
	play?: { animationId: string; at: number };
};

const KEY = /^[^\s/]+$/;

function key(value: string | null): string | undefined {
	return value && value.length <= BOARD_ID_MAX_LENGTH && KEY.test(value) ? value : undefined;
}

function view(value: string | null): BoardCameraState | undefined {
	const parts = value?.split(",") ?? [];
	if (parts.length !== 3 || parts.some((part) => part.trim() === "")) return undefined;
	const [centerX, centerY, zoom] = parts.map(Number) as [number, number, number];
	if (![centerX, centerY, zoom].every(Number.isFinite) || zoom <= 0) return undefined;
	return { centerX, centerY, zoom: clampZoom(zoom) };
}

export function parseBoardLaunch(hash: string): BoardLaunch | null {
	const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
	const launch: BoardLaunch = {};
	const focus = key(params.get("focus"));
	if (focus) launch.focus = focus;
	const camera = view(params.get("view"));
	if (camera) launch.view = camera;
	const animationId = key(params.get("play"));
	if (animationId) {
		const at = Number(params.get("t") ?? 0);
		launch.play = { animationId, at: Number.isFinite(at) && at > 0 ? Math.round(at) : 0 };
	}
	return Object.keys(launch).length ? launch : null;
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));

export function formatBoardLaunch(launch: BoardLaunch | null | undefined): string {
	const parts: string[] = [];
	if (launch?.focus) parts.push(`focus=${encodeURIComponent(launch.focus)}`);
	else if (launch?.view) {
		const { centerX, centerY, zoom } = launch.view;
		parts.push(`view=${round(centerX, 1)},${round(centerY, 1)},${round(clampZoom(zoom), 4)}`);
	}
	if (launch?.play) {
		parts.push(`play=${encodeURIComponent(launch.play.animationId)}`);
		if (launch.play.at > 0) parts.push(`t=${Math.round(launch.play.at)}`);
	}
	return parts.length ? `#${parts.join("&")}` : "";
}
