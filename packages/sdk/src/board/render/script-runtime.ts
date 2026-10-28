import type { BoardItem } from "@cohub/protocol";
import type {
  BoardScriptContext,
  BoardScriptEvent,
  BoardScriptEventOf,
  BoardScriptFrame,
  BoardScriptModule,
  BoardScriptOutput,
  BoardScriptSnapshot,
  BoardScriptView,
} from "../model/script.js";

export type ScriptRuntimeInput = {
  id: string;
  item: BoardItem;
  items: Record<string, BoardItem>;
  width: number;
  height: number;
  capabilities?: string[];
  snapshot?: BoardScriptSnapshot;
};

/** Self-contained so browser workers and Node execute exactly the same kernel. */
export function createScriptRuntime(
  module: BoardScriptModule,
  initial: ScriptRuntimeInput,
  host: {
    call(name: string, input: unknown): Promise<unknown>;
    invalidate(): void;
  },
) {
  if ("mount" in module)
    throw new Error(
      "Board scripts do not support DOM mount(). Use draw() or native scene items.",
    );
  if (module.frameRate !== undefined && !(Number.isFinite(module.frameRate) && module.frameRate >= 1 && module.frameRate <= 60))
    throw new Error("frameRate must be a number from 1 to 60.");
  if (module.pixelated !== undefined && typeof module.pixelated !== "boolean")
    throw new Error("pixelated must be a boolean.");
  const DISPLAY = ["position", "size", "rotation", "scale", "opacity", "style", "props", "z"];
  let input = initial;
  let disposed = false;
  let stepping = false;
  let revision = 0;
  let randomState = 2166136261;
  for (const char of initial.item.script?.seed ?? initial.id)
    randomState = Math.imul(randomState ^ char.charCodeAt(0), 16777619) >>> 0;
  const parameterDefaults = Object.fromEntries(
    Object.entries(module.parameters ?? {})
      .filter(([, spec]) => spec.default !== undefined)
      .map(([key, spec]) => [key, spec.default]),
  );
  let params = {
    ...parameterDefaults,
    ...initial.item.script?.params,
  } as BoardScriptFrame["params"];
  const state = structuredClone(initial.snapshot?.state ?? {});
  if (initial.snapshot) randomState = initial.snapshot.random;
  let time = initial.snapshot?.time ?? 0;
  let started = Boolean(initial.snapshot);
  const stepMs = 1000 / 60;
  let frame: BoardScriptFrame = {
    t: time,
    dt: 0,
    width: initial.width,
    height: initial.height,
    seed: initial.item.script?.seed ?? initial.id,
    params,
    state,
  };
  const handlers = new Map<string, Set<(event: BoardScriptEvent) => void>>();
  const frames = new Set<(frame: BoardScriptFrame) => void>();
  const cleanups: Array<() => void> = [];
  const effects = structuredClone(initial.snapshot?.effects);
  let patches: BoardScriptOutput["patches"] = effects?.patches ?? {};
  const layers: Record<"world" | "screen", Record<string, unknown>> = {
    world: effects?.world ?? {},
    screen: effects?.screen ?? {},
  };
  let anchor = effects?.anchor;
  let view: BoardScriptView | null = null;
  let hits: BoardScriptOutput["hits"] = effects?.hits ?? {};
  const invalidate = () => {
    if (disposed) return;
    revision++;
    host.invalidate();
  };
  const present: BoardScriptContext["present"] = (id, patch) => {
    if (patch === null) {
      if (!(id in patches)) return;
      delete patches[id];
    } else {
      if (!patch || typeof patch !== "object" || Object.keys(patch).some((key) => !DISPLAY.includes(key)))
        throw new Error(`present() only changes ${DISPLAY.join(", ")}.`);
      if (!input.items[id]) return;
      patches[id] = structuredClone(patch) as Record<string, unknown>;
    }
    invalidate();
  };
  const context: BoardScriptContext = {
    self: {
      id: initial.id,
      get base() {
        return input.item;
      },
      present: (patch) => present(initial.id, patch),
    },
    get params() {
      return params;
    },
    get targets() {
      return input.item.script?.targets ?? {};
    },
    async emit(target, type, data) {
      await host.call("board.emit", { target, type, data });
    },
    get items() {
      return input.items;
    },
    state,
    get frame() {
      return frame;
    },
    get view() { return view; },
    random() {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    },
    on(type, handler) {
      let listeners = handlers.get(type);
      if (!listeners) {
        listeners = new Set();
        handlers.set(type, listeners);
      }
      const listener = (event: BoardScriptEvent) => handler(event as BoardScriptEventOf<typeof type>);
      listeners.add(listener);
      invalidate();
      return () => {
        listeners.delete(listener);
        invalidate();
      };
    },
    onFrame(handler) {
      frames.add(handler);
      invalidate();
      return () => {
        frames.delete(handler);
        invalidate();
      };
    },
    onDispose: (handler) => cleanups.push(handler),
    invalidate,
    get: (id) => input.items[id],
    present,
    scene(next, options) {
      const space = options?.space ?? "world";
      if (space !== "world" && space !== "screen") throw new Error("Scene space must be world or screen.");
      if (options?.anchor && space !== "screen") throw new Error("Only screen scenes take an anchor.");
      if (!next || typeof next !== "object") throw new Error("scene() takes a record of items.");
      const other = layers[space === "world" ? "screen" : "world"];
      for (const id of Object.keys(next))
        if (Object.hasOwn(other, id)) throw new Error(`Temporary item IDs must be unique across scenes: ${id}`);
      if (JSON.stringify(next).length > 1_000_000) throw new Error("A temporary scene exceeds 1 MB.");
      layers[space] = structuredClone(next);
      if (space === "screen") anchor = options?.anchor ? structuredClone(options.anchor) : undefined;
      invalidate();
    },
    hitRegions(next) {
      hits = structuredClone(next);
      invalidate();
    },
    async commit(patch) {
      return (await host.call("board.commit", { patch, frame: stepping })) === true;
    },
    async layoutText(text) {
      return (await host.call("board.layoutText", text)) as { width: number; height: number };
    },
    capabilities: {
      has: (name) => (input.capabilities ?? []).includes(name),
      call: (name, value) => host.call(name, value),
    },
  };
  const setup = module.default?.(context);
  if (typeof setup === "function") cleanups.push(setup);
  return {
    get animated() {
      return frames.size > 0 || module.animated === true;
    },
    update(next: ScriptRuntimeInput) {
      input = next;
      for (const id of Object.keys(patches))
        if (!next.items[id]) {
          delete patches[id];
          revision++;
        }
      params = {
        ...parameterDefaults,
        ...next.item.script?.params,
      } as BoardScriptFrame["params"];
    },
    step(t: number) {
      if (disposed) return;
      if (!Number.isFinite(t) || t < time - 0.001)
        throw new Error("Reset the instance before seeking backwards.");
      const update = (at: number, dt: number) => {
        frame = {
          ...frame,
          t: at,
          dt,
          width: input.width,
          height: input.height,
          params: context.params,
        };
        stepping = true;
        try {
          for (const handler of frames) {
            const result: unknown = handler(frame);
            if (result && typeof (result as { then?: unknown }).then === "function")
              throw new Error("onFrame() handlers must be synchronous.");
          }
        } finally {
          stepping = false;
        }
      };
      if (!started) {
        started = true;
        update(time, 0);
      }
      if (frames.size) {
        while (time + stepMs <= t + 0.000001) {
          time += stepMs;
          update(time, stepMs);
        }
      } else time = t;
      frame = {
        ...frame,
        t,
        dt: 0,
        width: input.width,
        height: input.height,
        params: context.params,
      };
    },
    event(event: BoardScriptEvent) {
      if (disposed) return;
      if (event.type === "viewchange") view = event.data as BoardScriptView;
      const listeners = handlers.get(event.type);
      if (!listeners?.size) return;
      for (const handler of listeners) handler(event);
      invalidate();
    },
    draw(canvas: CanvasRenderingContext2D) {
      const result: unknown = module.draw?.(canvas, frame);
      if (result && typeof (result as { then?: unknown }).then === "function")
        throw new Error("draw() must be synchronous.");
    },
    output(): BoardScriptOutput {
      return {
        parameters: module.parameters,
        patches,
        world: layers.world,
        screen: layers.screen,
        anchor,
        hits,
        listens: [...handlers]
          .filter(([, callbacks]) => callbacks.size)
          .map(([type]) => type),
        animated: this.animated,
        updating: frames.size > 0,
        frameRate: module.frameRate,
        pixelated: module.pixelated,
        version: revision,
      };
    },
    snapshot(includeEffects = true, clone = true): BoardScriptSnapshot {
      const snapshot = {
        state,
        time,
        random: randomState,
        effects: includeEffects ? { patches, world: layers.world, screen: layers.screen, anchor, hits } : undefined,
      };
      return clone ? structuredClone(snapshot) : snapshot;
    },
    destroy() {
      disposed = true;
      for (const cleanup of cleanups.reverse()) cleanup();
      handlers.clear();
      frames.clear();
      patches = {};
      layers.world = {};
      layers.screen = {};
      hits = {};
    },
  };
}
