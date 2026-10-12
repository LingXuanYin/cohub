
import { z } from "zod";
import {
	BOARD_CAMERA_TARGET,
	BOARD_COLOR_TOKENS,
	BOARD_EFFECT_KINDS,
	BOARD_EFFECT_KIND_INFO,
	BOARD_ITEM_SCHEMAS,
	BOARD_ITEM_TYPES,
	BoardAnimationHeaderSchema,
	BoardKeySchema,
	BoardSettingsSchema,
	BoardTrackSchema,
	isBuiltinItemType,
} from "./board-model.js";
import { listBoardProperties } from "./board-patch.js";

type JsonSchema = Record<string, unknown>;

function toJsonSchema(schema: z.ZodType): JsonSchema {
	const { $schema: _schema, ...rest } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema;
	return rest;
}

export const BOARD_SCHEMA_TARGETS = ["board", "animation", "track", BOARD_CAMERA_TARGET, ...BOARD_ITEM_TYPES] as const;

export type BoardJsonSchemaResult = {
	schema?: JsonSchema;
	properties?: Array<{ property: string; kind: string }>;
	kinds?: Record<string, { description: string; parameters: Record<string, string> }>;
	semantics?: Record<string, string>;
};

export function boardJsonSchema(target: string): BoardJsonSchemaResult | null {
	if (target === "board") return { schema: toJsonSchema(BoardSettingsSchema) };
	if (target === "animation") {
		return {
			schema: toJsonSchema(BoardAnimationHeaderSchema.extend({ tracks: z.record(BoardKeySchema, BoardTrackSchema).optional() })),
			properties: listBoardProperties("animation"),
			semantics: { composition: "Target another animation's time property to drive its local clock. Parent markers control pauses; child markers are not automatically promoted." },
		};
	}
	if (target === "track") return { schema: toJsonSchema(BoardTrackSchema), semantics: {
		boundary: "Before the first keyframe and after the last, the value is held. Use opacity tracks to control visibility.",
		easing: "Defaults to linear. The destination keyframe controls the incoming segment. Supports CSS easing keywords, cubic-bezier() and steps().",
		composition: "replace: the most recently started track wins; ties use the lexicographically larger track ID. Before any start, the nearest upcoming track wins. add: numbers and positions add; opacity and scale multiply.",
		interpolation: "auto interpolates numbers, colors and vectors; other values step. spline smooths vector motion. orient follows the position tangent.",
	} };
	if (target === "effect") {
		return {
			schema: toJsonSchema(BOARD_ITEM_SCHEMAS.effect as unknown as z.ZodType),
			properties: listBoardProperties("effect"),
			semantics: { follow: "follow is used by trail only. Parent a particle effect to a decoration:none frame to move it with other items.", time: "Effects use animation time in milliseconds. trail samples target history; seed makes procedural particles repeatable." },
			kinds: Object.fromEntries(BOARD_EFFECT_KINDS.map((kind) => [kind, BOARD_EFFECT_KIND_INFO[kind]])),
		};
	}
	if (target === BOARD_CAMERA_TARGET) return { properties: listBoardProperties(BOARD_CAMERA_TARGET) };
	if (!isBuiltinItemType(target)) return null;
	return { schema: toJsonSchema(BOARD_ITEM_SCHEMAS[target] as unknown as z.ZodType), properties: listBoardProperties(target) };
}

export function boardSchemaOverview() {
	return {
		units: { time: "milliseconds", rotation: "degrees", length: "board units (1 = 1 CSS px at zoom 1)" },
		coordinates: "Positions, draw points and unbound arrow endpoints are relative to their parent frame; without a parent they are world coordinates. Shape paths are fitted to the item size.",
		types: BOARD_ITEM_TYPES,
		colors: { tokens: BOARD_COLOR_TOKENS, css: "any CSS color", themed: "{ light, dark }" },
		properties: Object.fromEntries(
			[...BOARD_ITEM_TYPES, BOARD_CAMERA_TARGET, "animation"].map((target) => [target, listBoardProperties(target).map((entry) => entry.property)]),
		),
	};
}
