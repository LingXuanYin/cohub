import { itemBounds, type Rect } from "./geometry.js";
import type { BoardScene, BoardSceneItem } from "./scene.js";

export type BoardRegion = { id: string; rect: Rect; label?: string };
export type BoardRegionDirection = "left" | "right" | "up" | "down";
export type BoardRegionStep = BoardRegionDirection | "next" | "previous" | "first" | "last";

const SAME_ROW = 0.5;
const CROSS_WEIGHT = 2;
const CENTER_WEIGHT = 0.1;

export function boardNavigableFrames(scene: BoardScene): BoardSceneItem[] {
	const frames: BoardSceneItem[] = [];
	const visit = (ids: readonly string[]) => {
		for (const id of ids) {
			const item = scene.get(id);
			if (item?.type !== "frame") continue;
			if (item.props.decoration !== "none" || item.props.label.trim()) frames.push(item);
			else visit(scene.children(id));
		}
	};
	visit(scene.children(undefined));
	return frames;
}

export function boardFrameRegion(item: BoardSceneItem): BoardRegion {
	const label = item.type === "frame" ? item.props.label.trim() : "";
	return { id: item.id, rect: itemBounds(item.frame), ...(label ? { label } : {}) };
}

export function boardFrameRegions(scene: BoardScene): BoardRegion[] {
	return boardReadingOrder(boardNavigableFrames(scene).map(boardFrameRegion));
}

const byId = (a: BoardRegion, b: BoardRegion) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function boardReadingOrder<T extends BoardRegion>(regions: readonly T[]): T[] {
	const sorted = [...regions].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x || byId(a, b));
	const rows: { top: number; bottom: number; regions: T[] }[] = [];
	for (const region of sorted) {
		const { y, height } = region.rect;
		const row = rows.at(-1);
		const overlap = row ? Math.min(row.bottom, y + height) - Math.max(row.top, y) : -1;
		if (row && overlap >= SAME_ROW * Math.min(height, row.bottom - row.top)) row.regions.push(region);
		else rows.push({ top: y, bottom: y + height, regions: [region] });
	}
	return rows.flatMap((row) => row.regions.sort((a, b) => a.rect.x - b.rect.x || a.rect.y - b.rect.y || byId(a, b)));
}

type Axis = { start: number; end: number; crossStart: number; crossEnd: number };

function axis(rect: Rect, horizontal: boolean): Axis {
	return horizontal
		? { start: rect.x, end: rect.x + rect.width, crossStart: rect.y, crossEnd: rect.y + rect.height }
		: { start: rect.y, end: rect.y + rect.height, crossStart: rect.x, crossEnd: rect.x + rect.width };
}

/** Left and right stay within regions sharing some height; up and down may reach regions offset sideways. */
export function boardRegionNeighbor<T extends BoardRegion>(
	regions: readonly T[],
	from: BoardRegion,
	direction: BoardRegionDirection,
): T | null {
	const horizontal = direction === "left" || direction === "right";
	const sign = direction === "right" || direction === "down" ? 1 : -1;
	const origin = axis(from.rect, horizontal);
	const center = (origin.start + origin.end) / 2;
	const crossCenter = (origin.crossStart + origin.crossEnd) / 2;
	let best: T | null = null;
	let bestScore = Number.POSITIVE_INFINITY;
	for (const region of regions) {
		if (region.id === from.id) continue;
		const other = axis(region.rect, horizontal);
		const ahead = sign > 0 ? other.end > origin.end && other.start + other.end > center * 2 : other.start < origin.start && other.start + other.end < center * 2;
		if (!ahead) continue;
		const gap = Math.max(0, sign > 0 ? other.start - origin.end : origin.start - other.end);
		const cross = Math.max(0, other.crossStart - origin.crossEnd, origin.crossStart - other.crossEnd);
		if (horizontal && cross > 0) continue;
		const drift = Math.abs((other.crossStart + other.crossEnd) / 2 - crossCenter);
		const score = gap + CROSS_WEIGHT * cross + CENTER_WEIGHT * drift;
		if (score < bestScore) {
			best = region;
			bestScore = score;
		}
	}
	return best;
}

export function boardRegionStep<T extends BoardRegion>(regions: readonly T[], from: BoardRegion, step: BoardRegionStep): T | null {
	const index = regions.findIndex((region) => region.id === from.id);
	switch (step) {
		case "next":
			return index < 0 ? null : (regions[index + 1] ?? null);
		case "previous":
			return index > 0 ? (regions[index - 1] ?? null) : null;
		case "first":
			return regions[0] ?? null;
		case "last":
			return regions.at(-1) ?? null;
		default:
			return (
				boardRegionNeighbor(regions, from, step) ??
				(step === "right" ? boardRegionStep(regions, from, "next") : step === "left" ? boardRegionStep(regions, from, "previous") : null)
			);
	}
}
