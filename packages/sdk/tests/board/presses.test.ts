import assert from "node:assert/strict";
import { test } from "node:test";
import { createBoardEditor } from "../../src/board/editor/index.js";
import { boardDocument, pointer } from "./fixtures.js";

test("a touch on the selected item drags it even where its ports reach in", () => {
	const editor = createBoardEditor({
		document: boardDocument({ items: { a: { type: "image", size: { width: 100, height: 100 }, props: { src: "img/a.png" } } } }),
		onCommit() {},
	});
	editor.setSelection(["a"]);
	editor.pointerDown(pointer(50, 95, { pointerType: "touch" }));
	assert.equal(editor.interaction.type, "translating");
	editor.pointerMove(pointer(50, 135, { pointerType: "touch" }));
	editor.pointerUp(pointer(50, 135, { pointerType: "touch", buttons: 0 }));
	assert.equal(editor.itemById("a")?.frame.y, 40);
	editor.destroy();
});
