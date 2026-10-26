import assert from "node:assert/strict";
import { test } from "node:test";
import { type BoardPointerEvent, createBoardEditor } from "../../src/board/editor/index.js";
import { screenPoint, worldPoint } from "../../src/board/model/index.js";
import { boardDocument } from "./fixtures.js";

function setup(tool?: "select" | "hand") {
	const commits: unknown[] = [];
	const editor = createBoardEditor({
		document: boardDocument({ items: { a: { type: "shape", size: { width: 100, height: 100 } } } }),
		initialTool: tool,
		onCommit: (patch) => void commits.push(patch),
	});
	const event = (x: number, y: number, pointerType: string, pointerId: number, buttons: number): BoardPointerEvent => ({
		pointerId,
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
	});
	const input = (pointerType = "mouse", pointerId = 1) => ({
		down: (x: number, y: number) => editor.pointerDown(event(x, y, pointerType, pointerId, 1)),
		move: (x: number, y: number) => editor.pointerMove(event(x, y, pointerType, pointerId, 1)),
		up: (x: number, y: number) => editor.pointerUp(event(x, y, pointerType, pointerId, 0)),
	});
	return { editor, commits, input };
}

test("a press within its slop, or a drag back to where it began, writes nothing", () => {
	const { editor, commits, input } = setup();
	const mouse = input();
	mouse.down(50, 50);
	mouse.move(53, 52);
	mouse.up(53, 52);
	mouse.down(50, 50);
	mouse.move(90, 50);
	mouse.move(50, 50);
	mouse.up(50, 50);
	assert.equal(commits.length, 0);
	assert.deepEqual(editor.itemById("a")?.position, { x: 0, y: 0 });
});

test("a second finger lands the drag so far, then pinches", () => {
	const { editor, commits, input } = setup();
	editor.setSelection(["a"]);
	input("touch").down(50, 50);
	input("touch").move(80, 50);
	input("touch", 2).down(200, 200);
	assert.equal(commits.length, 1);
	assert.deepEqual(editor.document.items.a?.position, { x: 30, y: 0 });
	input("touch", 2).move(260, 260);
	assert.ok(editor.camera.zoom > 1);
});

test("cancelling a drag puts everything back", () => {
	const { editor, commits, input } = setup();
	input().down(50, 50);
	input().move(150, 50);
	editor.cancelPointerInteraction();
	assert.equal(commits.length, 0);
	assert.deepEqual(editor.itemById("a")?.position, { x: 0, y: 0 });
});

test("touch browses with the hand: a tap selects and arms select, a touch away returns to the hand", () => {
	const { editor, input } = setup("hand");
	const finger = input("touch");
	finger.down(50, 50);
	finger.up(50, 50);
	assert.deepEqual(editor.selection, ["a"]);
	assert.equal(editor.tool, "select");
	finger.down(400, 400);
	assert.deepEqual(editor.selection, []);
	assert.equal(editor.tool, "hand");
});
