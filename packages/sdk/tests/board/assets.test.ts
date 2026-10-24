import assert from "node:assert/strict";
import { test } from "node:test";
import type { Texture } from "pixi.js";
import { createBoardAssetManager } from "../../src/board/stage/assets.js";
import { sceneItem } from "./fixtures.js";

const image = (id: string, x: number) =>
  sceneItem(id, { type: "image", position: { x, y: 0 }, size: { width: 100, height: 100 }, props: { src: `img/${id}.png` } });

function fakeTexture(edge: number): Texture {
  return { width: edge, height: edge, uid: Math.random(), source: {}, destroy() {} } as unknown as Texture;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("board asset loading", async (t) => {
  await t.test("queued loads start nearest the focus", async () => {
    const started: string[] = [];
    const pending: Array<() => void> = [];
    const assets = createBoardAssetManager({
      concurrency: 1,
      resolveFile: async (url) => ({ url }),
      loadTexture: (url) => {
        started.push(url);
        return new Promise((resolve) => pending.push(() => resolve(fakeTexture(64))));
      },
      unloadTexture: async () => {},
    });
    const items = [image("a", 0), image("far", 5000), image("near", 200)];
    assets.focus({ x: 250, y: 50 });
    for (const item of items) {
      const key = assets.assetKey(item) as string;
      assets.acquire(key);
      assets.requestItem(item);
      await settle();
    }
    while (pending.length) {
      pending.shift()?.();
      await settle();
    }
    assert.deepEqual(started, ["img/a.png", "img/near.png", "img/far.png"]);
    assets.destroy();
  });

  await t.test("cooling textures shrink once the camera rests, then resharpen on return", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const loads: string[] = [];
    const released: number[] = [];
    const assets = createBoardAssetManager({
      lruBudget: { maxCount: 100, maxBytes: 1024 * 1024 },
      resolveFile: async (url) => ({ url }),
      loadTexture: async (url) => {
        loads.push(url);
        return fakeTexture(1024);
      },
      unloadTexture: async (_url, texture) => {
        released.push(texture?.width ?? 0);
      },
      shrinkTexture: async (_texture, edge) => fakeTexture(edge),
    });
    const item = image("a", 0);
    const key = assets.assetKey(item) as string;
    assets.acquire(key);
    assets.requestItem(item);
    await settle();
    await settle();
    assert.equal(assets.getTexture(key)?.width, 1024);

    assets.release(key);
    assert.equal(assets.getTexture(key)?.width, 1024, "trimming waits for the camera to rest");
    t.mock.timers.tick(400);
    await settle();
    assert.equal(assets.getTexture(key)?.width, 256, "an over-budget texture keeps a small copy");
    assert.deepEqual(released, [1024]);

    assets.acquire(key);
    assets.requestItem(item);
    await settle();
    await settle();
    assert.equal(assets.getTexture(key)?.width, 1024, "a returning holder sharpens it again");
    assert.equal(loads.length, 2);
    assets.destroy();
  });

  await t.test("a cooling backlog shrinks a few at a time and keeps every compact copy that fits", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    let shrinking = 0;
    let peak = 0;
    const assets = createBoardAssetManager({
      lruBudget: { maxCount: 100, maxBytes: 4 * 1024 * 1024 },
      resolveFile: async (url) => ({ url }),
      loadTexture: async () => fakeTexture(1024),
      unloadTexture: async () => {},
      shrinkTexture: async (_texture, edge) => {
        peak = Math.max(peak, ++shrinking);
        await settle();
        shrinking -= 1;
        return fakeTexture(edge);
      },
    });
    const keys = Array.from({ length: 12 }, (_, index) => {
      const item = image(`i${index}`, index * 200);
      const key = assets.assetKey(item) as string;
      assets.acquire(key);
      assets.requestItem(item);
      return key;
    });
    for (let round = 0; round < 12; round += 1) await settle();
    for (const key of keys) assets.release(key);
    t.mock.timers.tick(400);
    for (let round = 0; round < 12; round += 1) await settle();
    assert.deepEqual(keys.map((key) => assets.getTexture(key)?.width), keys.map(() => 256));
    assert.equal(peak, 4);
    assets.destroy();
  });

  await t.test("prefetches leave room for cards, wait in the cooling pool and drop when the view moves on", async () => {
    const started: string[] = [];
    const pending = new Map<string, () => void>();
    const assets = createBoardAssetManager({
      concurrency: 3,
      resolveFile: async (url) => ({ url }),
      loadTexture: (url) => {
        started.push(url);
        return new Promise((resolve) => pending.set(url, () => resolve(fakeTexture(64))));
      },
      unloadTexture: async () => {},
    });
    const finish = async (url: string) => {
      pending.get(url)?.();
      pending.delete(url);
      await settle();
    };
    const show = async (id: string) => {
      const item = image(id, 0);
      assets.acquire(assets.assetKey(item) as string);
      assets.requestItem(item);
      await settle();
    };
    const ahead = ["p1", "p2", "p3", "p4"].map((id, index) => image(id, 1000 + index * 200));
    assets.prefetch(ahead.map((item) => ({ item, edge: 128 })));
    await settle();
    assert.deepEqual(started, ["img/p1.png", "img/p2.png"], "prefetches keep a slot free");

    await show("a");
    await show("b");
    assert.equal(started.at(-1), "img/a.png", "a card starts in the free slot");
    await finish("img/p1.png");
    assert.equal(started.at(-1), "img/b.png", "a waiting card goes before a queued prefetch");

    const p1 = assets.assetKey(ahead[0] as (typeof ahead)[number]) as string;
    assert.equal(assets.getTexture(p1)?.width, 64);
    assert.equal(assets.stats().cooling, 1, "a prefetched texture waits in the cooling pool");

    assets.prefetch([]);
    for (const url of [...pending.keys()]) await finish(url);
    assert.ok(!started.includes("img/p3.png") && !started.includes("img/p4.png"), "prefetches the view left never start");
    assert.equal(assets.stats().loading, 0);
    assets.destroy();
  });

  await t.test("hosts draw their own items through itemAsset", async () => {
    const loads: string[] = [];
    const covers = new Map([["c1", "https://works.cohub.live/c1.png"]]);
    const card = (id: string) =>
      sceneItem(id, { type: "acme.card", position: { x: 0, y: 0 }, size: { width: 200, height: 100 }, props: {} });
    const assets = createBoardAssetManager({
      resolveFile: async (url) => ({ url }),
      itemAsset: (item) => {
        if (item.type !== "acme.card") return undefined;
        const src = covers.get(item.id);
        return src ? { src, fit: "cover" } : null;
      },
      loadTexture: async (url) => {
        loads.push(url);
        return fakeTexture(384);
      },
      unloadTexture: async () => {},
    });
    const first = card("c1");
    const key = assets.assetKey(first) as string;
    assets.acquire(key);
    assets.requestItem(first, 384);
    await settle();
    await settle();
    assert.deepEqual(loads, ["https://works.cohub.live/c1.png?x-oss-process=image/resize,m_mfit,w_384,h_384/quality,q_82/format,webp"]);
    assert.ok(assets.getTexture(key));
    assert.equal(assets.assetKey(image("a", 0)), "file:img/a.png");

    const second = card("c2");
    assert.equal(assets.assetKey(second), null);
    covers.set("c2", "https://cdn.example.com/c2.png");
    assert.equal(assets.assetKey(second), null);
    assets.invalidateItemAssets();
    assert.equal(assets.assetKey(second), "cover:url:https://cdn.example.com/c2.png");
    assets.destroy();
  });
  await t.test("video frames size themselves from the host, then learn the aspect, then probe", async (t) => {
    const loads: string[] = [];
    const shrunk: number[] = [];
    t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) =>
      init?.method === "HEAD"
        ? new Response(null, { headers: { "x-oss-meta-width": "1080", "x-oss-meta-height": "1920" } })
        : new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x07, 0x80, 0x04, 0x38])));
    const portrait = (url: string) => {
      const width = Number(/w_(\d+)/.exec(url)?.[1]);
      return { ...fakeTexture(0), width, height: Math.round((width * 16) / 9) } as Texture;
    };
    const card = (id: string, src: string, natural?: { width: number; height: number }) =>
      sceneItem(id, { type: "acme.clip", position: { x: 0, y: 0 }, size: { width: 90, height: 160 }, props: { src, natural } });
    const assets = createBoardAssetManager({
      resolveFile: async (path) => ({ url: `https://public.cohub.run/${path}`, media: { width: 1080, height: 1920 } }),
      itemAsset: (item) => ({ media: "video", ...(item.props as { src: string; natural?: { width: number; height: number } }) }),
      loadTexture: async (url) => {
        loads.push(/w_\d+/.exec(url)?.[0] ?? url);
        return portrait(url);
      },
      unloadTexture: async () => {},
      shrinkTexture: async (texture, edge) => {
        shrunk.push(edge);
        return { ...fakeTexture(0), width: Math.round((texture.width * edge) / texture.height), height: edge } as Texture;
      },
    });
    const show = async (item: ReturnType<typeof card>, edge: number) => {
      if (edge === 384) assets.acquire(assets.assetKey(item) as string);
      assets.requestItem(item, edge);
      for (let round = 0; round < 6; round += 1) await settle();
    };

    await show(card("known", "https://works.cohub.live/known.mp4", { width: 1080, height: 1920 }), 384);
    await show(card("meta", "https://router-files.neta.art/files/meta.mp4"), 384);
    await show(card("file", "clips/file.mp4"), 384);
    assert.deepEqual(loads, ["w_216", "w_216", "w_216"], "a host-given size, media metadata or a file's facts size the first frame");

    loads.length = 0;
    const guessed = card("guessed", "https://public.cohub.run/guessed.mp4");
    await show(guessed, 384);
    assert.deepEqual([loads, shrunk], [["w_384"], [384]], "an unknown portrait is guessed wide, then shrunk on arrival");
    await show(guessed, 768);
    assert.equal(loads.at(-1), "w_432", "the learned aspect orients the next frame");
    await show(guessed, 1536);
    assert.deepEqual(loads, ["w_384", "w_432", "w_864"], "past the guess, the frame header sizes it once");
    assert.deepEqual(assets.getNaturalSize(assets.assetKey(guessed) as string), { width: 1080, height: 1920 });
    assets.destroy();
  });
});
