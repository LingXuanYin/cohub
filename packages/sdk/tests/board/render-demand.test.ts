import assert from "node:assert/strict";
import { test } from "node:test";
import { Container, Graphics } from "pixi.js";
import { createBoardScene } from "../../src/board/stage/scene.js";
import { buildBoardScene, buildFallbackShapeColors } from "../../src/board/model/index.js";
import { DEFAULT_BOARD_RENDER_LABELS, defaultBoardPalette, defaultBoardRenderStyle, type BoardRenderContext, type BoardCardRenderer } from "../../src/board/render/index.js";
import { boardDocument } from "./fixtures.js";

test("scene keeps resolution invalidation local and exposes committed far coverage", () => {
  const document = boardDocument({ items: Object.fromEntries(Array.from({ length: 480 }, (_, id) => [String(id), {
    type: "shape", position: { x: id * 100, y: 0 }, size: { width: 80, height: 80 },
  }])) });
  const model = buildBoardScene(document);
  let updates = 0;
  let resolutions = 0;
  let farFrames = 0;
  let ticking = true;
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const previous = { request: globalThis.requestAnimationFrame, cancel: globalThis.cancelAnimationFrame };
  globalThis.requestAnimationFrame = (callback) => { callbacks.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => { callbacks.delete(id); };
  const renderer: BoardCardRenderer = {
    id: "test", canRender: () => true,
    create: () => new Container(), update: () => { updates++; },
    resolution: (_container, _item, context) => { resolutions++; ticking = context.zoom > 0.5; },
    tick: () => ticking ? 16 : null,
    renderFar: () => {},
    destroy: (container) => container.destroy(),
  };
  const world = new Container();
  const overlay = new Graphics();
  const scene = createBoardScene({ world, overlay, getRenderer: () => renderer, onFarLayerFrame: () => { farFrames++; } });
  const context: BoardRenderContext = {
    settings: document.board, scene: model, time: 0, selectedIds: new Set(), hoveredId: null,
    resizingIds: new Set(), liftedIds: new Set(), palette: defaultBoardPalette("light"),
    colors: buildFallbackShapeColors("light"), colorScheme: "light", style: defaultBoardRenderStyle("light"),
    themeKey: "test", rendererType: "canvas", zoom: 1, reducedMotion: true, labels: DEFAULT_BOARD_RENDER_LABELS,
    taskRun: () => null, assetKey: () => null, getTexture: () => null, hasError: () => false,
    fileState: () => "ok", acquireTexture: () => {}, releaseTexture: () => {},
  };
  const all = new Set(model.items.map((item) => item.id));
  const few = new Set([...all].slice(-10));
  const pinned = new Set<string>();
  const sync = (visibleIds: Set<string>) => scene.sync({
    items: model.items, strokes: [], scene: model, context, getItem: (id) => model.get(id) ?? null,
    visibleIds, pinnedIds: pinned, globalSig: "same", structureVersion: 1, geometryVersion: 1, gestureActive: false,
  });
  try {
    sync(few);
    context.zoom = 1.1;
    sync(few);
    assert.equal(updates, 0);
    assert.equal(resolutions, 10);
    context.zoom = 1.2;
    sync(few);
    assert.equal(resolutions, 10);
    assert.equal(updates, 0);
    assert.equal(scene.tick(0), 16);
    context.zoom = 0.4;
    sync(few);
    assert.equal(scene.tick(16), null, "simplified content stops ticking");
    context.zoom = 1.2;
    sync(few);
    assert.equal(scene.tick(32), 16, "resolution-only updates restart detailed content ticks");
    assert.equal(updates, 0);
    sync(all);
    assert.ok(scene.getNode("479"), "uncovered real content survives the live-node budget");
    while (callbacks.size) {
      const batch = [...callbacks.values()]; callbacks.clear();
      for (const callback of batch) callback(0);
    }
    assert.equal(farFrames, 2);
    pinned.add("0");
    sync(all);
    assert.ok(scene.getNode("0"), "pinned content remains materialized");
    assert.equal(scene.getNode("1"), null, "covered content is no longer materialized");
    sync(few);
    assert.ok(scene.getNode("479"), "leaving far mode restores real content");
  } finally {
    scene.destroy(context);
    world.destroy({ children: true });
    overlay.destroy();
    globalThis.requestAnimationFrame = previous.request;
    globalThis.cancelAnimationFrame = previous.cancel;
  }
});
