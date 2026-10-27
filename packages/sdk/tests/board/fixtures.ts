import { type BoardDocument, parseBoardDocument } from "@cohub/protocol";
import type { BoardPointerEvent } from "../../src/board/editor/index.js";
import { screenPoint, worldPoint } from "../../src/board/model/geometry.js";
import { type BoardScene, type BoardSceneItem, buildBoardScene } from "../../src/board/model/scene.js";

/** A parsed document from loose input; throws on invalid input. */
export function boardDocument(input: { board?: Record<string, unknown>; items?: Record<string, unknown>; animations?: Record<string, unknown> }): BoardDocument {
	const parsed = parseBoardDocument({ board: input.board ?? {}, items: input.items ?? {}, animations: input.animations ?? {} });
	if (!parsed.ok) throw new Error(parsed.diagnostics.map((entry) => `${entry.path}: ${entry.message}`).join("; "));
	return parsed.document;
}

export function boardScene(items: Record<string, unknown>): BoardScene {
	return buildBoardScene(boardDocument({ items }));
}

/** One scene item, resolved alone. */
export function sceneItem(id: string, item: Record<string, unknown>): BoardSceneItem {
	return boardScene({ [id]: item }).get(id) as BoardSceneItem;
}

export function pointer(x: number, y: number, { pointerType = "mouse", buttons = 1 } = {}): BoardPointerEvent {
	return {
		pointerId: 1,
		screen: screenPoint(x, y),
		world: worldPoint(x, y),
		shiftKey: false,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		button: 0,
		buttons,
		pointerType,
		cancelled: false,
		pressure: 0.5,
	};
}
