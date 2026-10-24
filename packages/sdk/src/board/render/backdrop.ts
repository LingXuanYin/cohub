import { BOARD_GRID_DEFAULT_SIZE, type BoardBackgroundFit, type BoardSettings } from "@cohub/protocol";
import { type BoardShapeColors, isBoardColorId, pickBoardColor } from "../model/palette.js";
import { parseBoardCssColor } from "./css-color.js";
import type { BoardRenderPalette } from "./renderers/board-renderer-registry.js";
import type { BoardRenderStyle } from "./style.js";

export type BoardBackdropPattern = {
	kind: "dots" | "grid";
	pitch: number;
	color: number;
	alpha: number;
	size: number;
	shape: "round" | "square";
	subdivide: boolean;
};

export type BoardBackdropImage = {
	src: string;
	fit: BoardBackgroundFit;
	opacity: number;
	tile?: { width: number; height: number };
};

export type BoardBackdrop = {
	color: number;
	image: BoardBackdropImage | null;
	pattern: BoardBackdropPattern | null;
};

export type BoardThemeBackdrop = {
	image?: BoardBackdropImage;
	pattern?: Pick<BoardBackdropPattern, "kind" | "pitch" | "color"> & Partial<Pick<BoardBackdropPattern, "alpha" | "size">>;
};

export type BoardBackdropTheme = {
	palette: BoardRenderPalette;
	colors: BoardShapeColors;
	colorScheme: "dark" | "light";
	style?: Pick<BoardRenderStyle, "corner">;
	backdrop?: BoardThemeBackdrop;
};

const PATTERN_DEFAULTS = {
	dots: { alpha: 0.5, size: 2 },
	grid: { alpha: 1, size: 1 },
} as const;

export function resolveBoardBackdrop(
	settings: BoardSettings,
	theme: BoardBackdropTheme,
	purpose: "stage" | "export" = "stage",
): BoardBackdrop {
	const { color, image, pattern } = settings.background;
	const own = color !== undefined || image !== undefined;
	const themed = !own && purpose === "stage" ? theme.backdrop : undefined;
	return {
		color: backgroundColor(settings.background.color, theme),
		image: image ? { src: image.src, fit: image.fit, opacity: image.opacity ?? 1 } : (themed?.image ?? null),
		pattern:
			purpose === "export" || pattern === "none"
				? null
				: pattern
					? patternStyle(theme, pattern, settings.grid?.size ?? BOARD_GRID_DEFAULT_SIZE, false)
					: themed?.pattern
						? patternStyle(theme, themed.pattern.kind, themed.pattern.pitch, true)
						: null,
	};
}

function backgroundColor(color: BoardSettings["background"]["color"], theme: BoardBackdropTheme): number {
	const value = typeof color === "object" ? color[theme.colorScheme] : color;
	if (!value) return theme.palette.bg;
	const token = value.trim().toLowerCase();
	if (isBoardColorId(token)) return pickBoardColor(theme.colors, token, theme.colorScheme).fill;
	return parseBoardCssColor(value) ?? theme.palette.bg;
}

function patternStyle(theme: BoardBackdropTheme, kind: BoardBackdropPattern["kind"], pitch: number, subdivide: boolean): BoardBackdropPattern {
	const own = theme.backdrop?.pattern?.kind === kind ? theme.backdrop.pattern : undefined;
	const defaults = PATTERN_DEFAULTS[kind];
	return {
		kind,
		pitch,
		color: own?.color ?? (kind === "grid" ? theme.palette.border : theme.palette.muted),
		alpha: own ? (own.alpha ?? 1) : defaults.alpha,
		size: own?.size ?? defaults.size,
		shape: theme.style?.corner === "pixel" ? "square" : "round",
		subdivide,
	};
}

const MIN_GAP = 8;

export function boardPatternLevel(pattern: Pick<BoardBackdropPattern, "pitch" | "subdivide">, zoom: number): { pitch: number; fade: number } {
	const gap = Math.max(pattern.pitch / 2, MIN_GAP);
	const unit = pattern.pitch * Math.max(zoom, 1e-6);
	const level = Math.ceil(Math.log2(gap / unit));
	const pitch = unit * 2 ** (pattern.subdivide ? level : Math.max(0, level));
	const t = Math.min(1, Math.max(0, pitch / gap - 1));
	return { pitch, fade: t * t * (3 - 2 * t) };
}
