import assert from "node:assert/strict";
import { test } from "node:test";
import { createBoardEditor } from "../../src/board/editor/index.js";
import type { BoardPatch } from "../../src/board/model/index.js";
import { boardDocument } from "./fixtures.js";

function setup(animations: Record<string, unknown> = { intro: { duration: 1000 } }) {
	const commits: BoardPatch[] = [];
	const editor = createBoardEditor({
		document: boardDocument({ items: { box: { type: "shape", position: { x: 10, y: 20 }, opacity: 0.5 } }, animations }),
		onCommit(patch) { commits.push(patch); },
	});
	return { editor, commits, tracks: () => editor.document.animations.intro?.tracks ?? {} };
}

test("moving keyframes clamps at zero, replaces what they land on, and is one undo step", () => {
	const { editor, tracks, commits } = setup({ intro: { duration: 1000, tracks: {
		fade: { target: "box", property: "opacity", keyframes: [{ at: 100, value: 0 }, { at: 400, value: 0.4 }, { at: 600, value: 1 }] },
	} } });
	editor.setPlayhead({ animationId: "intro", time: 0 });
	const moved = editor.moveKeyframes([{ trackId: "fade", at: 100 }, { trackId: "fade", at: 400 }], -300);
	assert.deepEqual(moved.map((key) => key.at).sort((a, b) => a - b), [0, 300]);
	assert.deepEqual(tracks().fade?.keyframes.map((keyframe) => keyframe.at), [0, 300, 600]);
	const landed = editor.moveKeyframes([{ trackId: "fade", at: 300 }], 300);
	assert.deepEqual(landed, [{ trackId: "fade", at: 600 }]);
	assert.deepEqual(tracks().fade?.keyframes, [{ at: 0, value: 0 }, { at: 600, value: 0.4 }]);
	assert.equal(commits.length, 2);
	editor.undo();
	assert.deepEqual(tracks().fade?.keyframes.map((keyframe) => keyframe.at), [0, 300, 600]);
});

test("additive tracks in nested animations are left out of a key, and invalid edits are dropped", () => {
	const { editor, tracks, commits } = setup({
		lift: { duration: 1000, tracks: { up: { target: "box", property: "position", composite: "add", keyframes: [{ at: 0, value: { x: 0, y: 20 } }] } } },
		intro: { duration: 1000, tracks: { nest: { target: "lift", property: "time", keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 1000 }] } } },
	});
	editor.setPlayhead({ animationId: "intro", time: 0 });
	editor.keyProperty("box", "position");
	assert.deepEqual(tracks()["box-position"]?.keyframes, [{ at: 0, value: { x: 10, y: 20 } }]);
	editor.keyProperty("box", "opacity");
	const count = commits.length;
	assert.equal(editor.setKeyframe({ trackId: "box-position", at: 0 }, { ease: "ease-ot" }), null);
	assert.equal(editor.setKeyframe({ trackId: "box-opacity", at: 0 }, { value: 2 }), null);
	assert.equal(editor.updateAnimation("intro", { duration: 25 * 60 * 60 * 1000 }), false);
	assert.equal(commits.length, count);
});
