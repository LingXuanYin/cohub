import assert from "node:assert/strict";
import { test } from "node:test";
import { worldPoint } from "../../src/board/model/geometry.js";
import { buildBoardScene } from "../../src/board/model/scene.js";
import { boardScriptTarget } from "../../src/board/model/script-hit.js";
import { composeBoardScriptItems } from "../../src/board/model/script-scene.js";
import { boardScriptPress, boardScriptsMayTakeInput, boardScriptTakesTool, createBoardScriptPointerRouter } from "../../src/board/stage/script-pointer.js";
import type { BoardScriptOutput } from "../../src/board/model/script.js";
import { boardDocument } from "./fixtures.js";

test("declared controls capture input while ordinary cards and decoration do not", () => {
  const doc = boardDocument({ items: {
    owner: { type: "frame", size: { width: 600, height: 400 }, props: { decoration: "none", clip: false }, script: { src: "main.js" } },
    card: { type: "shape", parent: "owner", position: { x: 20, y: 20 }, size: { width: 100, height: 100 } },
  } });
  const output: BoardScriptOutput = {
    patches: {}, listens: [], animated: false, version: 1, screen: {},
    world: {
      button: { type: "shape", position: { x: 200, y: 20 }, size: { width: 80, height: 40 } },
      decoration: { type: "shape", position: { x: 20, y: 20 }, size: { width: 100, height: 100 } },
    },
    hits: { action: { item: "button", label: "Action" } },
  };
  const outputs = new Map([["owner", output]]);
  const composed = composeBoardScriptItems(doc, buildBoardScene(doc), outputs);
  const scene = buildBoardScene({ ...doc, items: { ...doc.items, ...Object.fromEntries(composed) } });
  const hit = (x: number, y: number) => boardScriptTarget(scene, scene.items.map((item) => item.id), worldPoint(x, y), outputs,
    (item, point) => point.x >= item.frame.x && point.y >= item.frame.y && point.x <= item.frame.x + item.frame.width && point.y <= item.frame.y + item.frame.height);
  assert.equal(hit(40, 40), null);
  assert.deepEqual(hit(220, 30), { owner: "owner", target: "action" });
  assert.equal(hit(500, 300), null);
});

test("removing a captured target cancels its gesture without transferring it to the editor", () => {
  const router = createBoardScriptPointerRouter();
  const removed = { owner: "owner", target: "removed" };
  const retained = { owner: "owner", target: "retained" };
  for (const [id, target] of [removed, retained].entries()) router.route("down", id, target, { x: 0, y: 0 });
  const cancelled: number[] = [];
  router.cancelScripts((id) => cancelled.push(id), "owner", { retained: {} });
  assert.deepEqual(cancelled, [0]);
  assert.equal(router.owner(0), "script");
  assert.deepEqual(router.route("up", 0, removed, { x: 0, y: 0 }), { recipient: null, click: null });
  assert.deepEqual(router.route("up", 1, retained, { x: 0, y: 0 }), { recipient: retained, click: retained });
});

test("scripts take input by default and yield to modifiers, other tools, gestures and handles", () => {
  const plain = { button: 0, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false };
  const editor = { busy: false, onHandle: () => false };
  assert.equal(boardScriptsMayTakeInput(plain, editor), true);
  assert.equal(boardScriptsMayTakeInput({ ...plain, shiftKey: true }, editor), false);
  assert.equal(boardScriptsMayTakeInput({ ...plain, button: 1 }, editor), false);
  assert.equal(boardScriptsMayTakeInput(plain, { ...editor, busy: true }), false);
  assert.equal(boardScriptsMayTakeInput(plain, { ...editor, onHandle: () => true }), false);
  assert.equal(boardScriptTakesTool(undefined, "select", false), true);
  assert.equal(boardScriptTakesTool(undefined, "hand", false), true);
  assert.equal(boardScriptTakesTool(undefined, "draw", false), false);
  assert.equal(boardScriptTakesTool(["draw"], "draw", false), true);
  assert.equal(boardScriptTakesTool(["draw"], "select", false), false);
  assert.equal(boardScriptTakesTool(undefined, "draw", true), true);
  assert.equal(boardScriptPress(["click"]), "tap");
  assert.equal(boardScriptPress(["click", "pointermove"]), "drag");
  assert.equal(boardScriptPress(["click", "pointermove"], true), "tap");
  assert.equal(boardScriptPress(["pointerdown"], true), "pass");
  assert.equal(boardScriptPress(["pointerenter", "keydown"]), "pass");
});
