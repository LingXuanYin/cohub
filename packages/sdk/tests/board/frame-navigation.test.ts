import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createBoardEditor } from "../../src/board/editor/index.js";
import { boardFrameRegions, boardRegionStep } from "../../src/board/model/index.js";
import { boardDocument, boardScene, pointer } from "./fixtures.js";

const frame = (x: number, y: number) => ({ type: "frame", position: { x, y }, size: { width: 960, height: 540 } });
const grid = { a: frame(0, 0), b: frame(1080, 0), c: frame(0, 640), d: frame(1080, 640), e: frame(2160, 700) };
const touch = (x: number, y: number, buttons = 1) => pointer(x, y, { pointerType: "touch", buttons });

const { requestAnimationFrame: raf, cancelAnimationFrame: caf } = globalThis;
before(() => {
	globalThis.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame;
	globalThis.cancelAnimationFrame = () => {};
});
after(() => {
	globalThis.requestAnimationFrame = raf;
	globalThis.cancelAnimationFrame = caf;
});

test("frames read in rows and step by direction", () => {
	const regions = boardFrameRegions(boardScene(grid));
	assert.deepEqual(regions.map((region) => region.id), ["a", "b", "c", "d", "e"]);
	const step = (id: string, to: Parameters<typeof boardRegionStep>[2]) =>
		boardRegionStep(regions, regions.find((region) => region.id === id) as (typeof regions)[number], to)?.id ?? null;
	assert.equal(step("a", "down"), "c");
	assert.equal(step("d", "right"), "e");
	assert.equal(step("b", "right"), "c");
	assert.equal(step("a", "up"), null);
});

test("presenting never moves a card, by swipe or long press", () => {
	const commits: unknown[] = [];
	const editor = createBoardEditor({
		document: boardDocument({
			items: { ...grid, photo: { type: "image", parent: "a", position: { x: 100, y: 100 }, size: { width: 400, height: 300 }, props: { src: "https://cdn.example.com/a.webp" } } },
		}),
		onCommit(patch) {
			commits.push(patch);
		},
	});
	editor.surfaceSize = { width: 1000, height: 600 };
	editor.goToFrame("a", { present: true, animate: false });
	editor.pointerDown(touch(300, 250));
	assert.equal(editor.pickUp(), null);
	editor.pointerMove(touch(100, 250));
	editor.pointerUp(touch(100, 250, 0));
	assert.equal(commits.length, 0);
	assert.equal(editor.frameView?.id, "b");
});

test("deleting the presented frame ends the presentation", () => {
	const editor = createBoardEditor({ document: boardDocument({ items: grid }), onCommit() {} });
	editor.surfaceSize = { width: 1000, height: 600 };
	editor.goToFrame("b", { present: true, animate: false });
	const { b: _deleted, ...rest } = grid;
	editor.loadDocument(boardDocument({ items: rest }), "board");
	assert.equal(editor.frameView, null);
	const before = editor.camera;
	editor.scroll(40, 0);
	assert.notDeepEqual(editor.camera, before);
});
