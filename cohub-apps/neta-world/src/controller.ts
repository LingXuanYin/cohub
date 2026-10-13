import {
  buildFallbackShapeColors,
  createBoardRegistry,
  placeBoardOverlay,
  worldPoint,
  type BoardDocument,
  type Rect,
} from '@neta-art/cohub/board';
import { createBoardEditor, type BoardEditor } from '@neta-art/cohub/board/editor';
import {
  createBoardAssetManager,
  mountBoardStage,
  type BoardStage,
} from '@neta-art/cohub/board/stage';
import { defaultBoardPalette, ensureBoardTextMeasurement } from '@neta-art/cohub/board/render';
import { cardPatch, cardRoot, cards, findSpace, WALKER, type Card } from './world';
import { documentBase } from './cohub';

export type WorldView = {
  document: BoardDocument;
  selected: Card[];
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
};
export class WorldController {
  readonly editor: BoardEditor;
  readonly stage: BoardStage;
  private assets;
  private stops: Array<() => void> = [];
  private idleTimer: ReturnType<typeof setInterval>;
  private visit = 0;
  private enabled = true;
  private destroyed = false;
  private effect: { x: number; y: number; started: number; sources: Rect[] } | null = null;
  private raf = 0;
  private dark = false;
  private lastPair = '';
  readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(
    private host: HTMLElement,
    document: BoardDocument,
    private hooks: {
      change(view: WorldView): void;
      save(document: BoardDocument): void;
      inspect(ids: string[]): void;
      near(ids: string[]): void;
      suggest(ids: string[]): void;
      error(): void;
    },
  ) {
    ensureBoardTextMeasurement();
    const registry = createBoardRegistry();
    this.editor = createBoardEditor({
      registry: {
        ...registry,
        hitTest: (item, point) => {
          const document = this.editor?.document;
          const root = document && cardRoot(document, item.id);
          return root && root !== item.id ? false : registry.hitTest(item, point);
        },
      },
      document,
      onCommit: () => {
        hooks.save(this.editor.document);
      },
    });
    const resolveFileUrl = async (path: string) =>
      /^(art\/[a-z-]+\.webp|scripts\/walker\.js)$/.test(path)
        ? new URL(path, documentBase()).href
        : null;
    this.assets = createBoardAssetManager({ resolveFileUrl });
    this.stage = mountBoardStage(host, {
      editor: this.editor,
      assets: this.assets,
      source: { resolveFileUrl },
      theme: () => ({
        key: this.dark ? 'neta-dark' : 'neta-light',
        colorScheme: this.dark ? 'dark' : 'light',
        palette: defaultBoardPalette(this.dark ? 'dark' : 'light'),
        colors: buildFallbackShapeColors(this.dark ? 'dark' : 'light'),
      }),
      safeRect: () => this.safeRect(),
      scriptCapabilities: {
        'world.destination': async (owner) => {
          if (owner !== WALKER || !this.enabled || this.destroyed) return null;
          if (this.reduced) return { reducedMotion: true };
          const selected = this.selected();
          const visible = this.all().filter((card) => {
            const r = this.screenRect(card.id);
            return (
              r &&
              r.x + r.width > 0 &&
              r.x < this.host.clientWidth &&
              r.y + r.height > 0 &&
              r.y < this.host.clientHeight
            );
          });
          const card = selected[0] ?? visible[this.visit++ % Math.max(1, visible.length)];
          const r = card && this.rect(card.id);
          const scale = Math.max(1, 1 / this.editor.camera.zoom);
          return r ? { x: r.x - 52 * scale, y: r.y + r.height - 48 * scale } : null;
        },
        'world.drop': async (owner, input) => {
          if (
            owner !== WALKER ||
            !input ||
            typeof input !== 'object' ||
            !('x' in input) ||
            !('y' in input) ||
            typeof input.x !== 'number' ||
            typeof input.y !== 'number'
          )
            return;
          const point = { x: input.x, y: input.y };
          const card = this.all().find((card) => {
            const r = this.rect(card.id);
            return (
              r &&
              point.x >= r.x &&
              point.x <= r.x + r.width &&
              point.y >= r.y &&
              point.y <= r.y + r.height
            );
          });
          if (card) {
            this.select([card.id]);
            hooks.inspect([card.id]);
          }
        },
      },
      onDoubleClick: (item) => {
        const id = item && cardRoot(this.editor.document, item.id);
        if (id) hooks.inspect([id]);
        return false;
      },
      drawOverlay: (g) => {
        for (const card of this.selected()) {
          const r = this.rect(card.id);
          if (r)
            g.roundRect(r.x - 5, r.y - 5, r.width + 10, r.height + 10, 8).stroke({
              color: 0x879c6c,
              width: 2 / this.editor.camera.zoom,
            });
        }
        const fx = this.effect;
        if (!fx) return;
        const progress = Math.min(1, (performance.now() - fx.started) / 850);
        for (const r of fx.sources) {
          const sx = r.x + r.width / 2,
            sy = r.y + r.height / 2;
          for (let i = 0; i < 9; i++) {
            const p = Math.min(1, Math.max(0, progress * 1.5 - i * 0.055));
            g.rect(
              sx + (fx.x - sx) * p,
              sy + (fx.y - sy) * p - Math.sin(p * Math.PI) * 50,
              4,
              4,
            ).fill({ color: 0x81976a, alpha: 1 - progress });
          }
        }
        g.circle(fx.x, fx.y, 12 + progress * 46).stroke({
          color: 0xb68c56,
          width: 2,
          alpha: 1 - progress,
        });
      },
    });
    this.stage.setScriptMode('interact');
    this.idleTimer = setInterval(() => {
      if (
        this.destroyed ||
        !this.enabled ||
        globalThis.document.hidden ||
        this.editor.gestureActive ||
        this.selected().length
      )
        return;
      const visible = new Set(
        this.all()
          .filter((card) => {
            const r = this.screenRect(card.id);
            return (
              r &&
              r.x >= 0 &&
              r.y >= 0 &&
              r.x + r.width <= host.clientWidth &&
              r.y + r.height <= host.clientHeight
            );
          })
          .map((c) => c.id),
      );
      const pairs = Object.values(this.editor.document.items).flatMap((item) =>
        item.type === 'arrow' &&
        'item' in item.props.start &&
        'item' in item.props.end &&
        visible.has(item.props.start.item) &&
        visible.has(item.props.end.item)
          ? [[item.props.start.item, item.props.end.item]]
          : [],
      );
      const pair = pairs[this.visit % Math.max(1, pairs.length)];
      if (pair) hooks.suggest(pair);
    }, 25000);
    this.stops.push(
      this.editor.subscribe(['document', 'selection', 'camera', 'history', 'interaction'], () =>
        this.notify(),
      ),
    );
    this.stops.push(
      this.editor.subscribe('selection', () => {
        const ids = [
          ...new Set(this.editor.selection.map((id) => cardRoot(this.editor.document, id) ?? id)),
        ];
        if (
          ids.length !== this.editor.selection.length ||
          ids.some((id, i) => id !== this.editor.selection[i])
        )
          this.editor.setSelection(ids);
      }),
    );
    this.stops.push(
      this.editor.subscribeTransforms((e) => {
        if (e.cancelled || e.operation !== 'move') return;
        const moved = [
          ...new Set(
            e.ids.flatMap((id) => {
              const root = cardRoot(this.editor.document, id);
              return root ? [root] : [];
            }),
          ),
        ];
        if (moved.length !== 1) return;
        const id = moved[0];
        const a = id && this.rect(id);
        if (!a) return;
        const neighbor = this.all().find((c) => {
          if (c.id === id) return false;
          const b = this.rect(c.id);
          return (
            b &&
            Math.hypot(
              Math.max(0, b.x - a.x - a.width, a.x - b.x - b.width),
              Math.max(0, b.y - a.y - a.height, a.y - b.y - b.height),
            ) < 70
          );
        });
        if (neighbor && id) {
          const pair = [id, neighbor.id].sort().join(':');
          if (pair !== this.lastPair) {
            this.lastPair = pair;
            hooks.near([id, neighbor.id]);
          }
        }
      }),
    );
    void this.stage.ready.then((ok) => {
      if (this.destroyed) return;
      if (!ok) hooks.error();
      else {
        this.editor.surfaceSize = { width: host.clientWidth, height: host.clientHeight };
        this.fit();
        this.notify();
      }
    });
  }
  all() {
    return cards(this.editor.document);
  }
  selected() {
    const ids = new Set(this.editor.selection.map((id) => cardRoot(this.editor.document, id)));
    return this.all().filter((c) => ids.has(c.id));
  }
  rect(id: string): Rect | null {
    return this.editor.scene.get(id)?.frame ?? null;
  }
  screenRect(id: string): Rect | null {
    const r = this.rect(id);
    if (!r) return null;
    const c = this.editor.camera;
    return {
      x: r.x * c.zoom + c.x,
      y: r.y * c.zoom + c.y,
      width: r.width * c.zoom,
      height: r.height * c.zoom,
    };
  }
  safeRect(): Rect {
    return {
      x: 16,
      y: 16,
      width: Math.max(0, this.host.clientWidth - 32),
      height: Math.max(0, this.host.clientHeight - 76),
    };
  }
  overlay(id: string, size: { width: number; height: number }) {
    const anchor = this.screenRect(id);
    return anchor ? placeBoardOverlay({ anchor, size, safeRect: this.safeRect(), gap: 20 }) : null;
  }
  select(ids: string[]) {
    this.editor.setSelection(ids);
  }
  focus(id: string) {
    this.select([id]);
    this.editor.focusItems([id], { maxZoom: 1, padding: 90 });
  }
  fit() {
    const ids = this.all().map((c) => c.id);
    if (ids.length) this.editor.focusItems(ids, { padding: 60, maxZoom: 0.95 });
    else this.editor.fitView();
  }
  setTheme(dark: boolean) {
    this.dark = dark;
    this.stage.invalidate({ cards: true });
  }
  pause(paused: boolean) {
    this.enabled = !paused;
    this.stage.setScriptMode(paused ? 'paused' : 'interact');
  }
  private notify() {
    this.hooks.change({
      document: this.editor.document,
      selected: this.selected(),
      zoom: this.editor.camera.zoom,
      canUndo: this.editor.canUndo,
      canRedo: this.editor.canRedo,
    });
  }
  async update(card: Card) {
    const original = this.editor.document.items[card.id];
    if (!original) throw new Error('The source card no longer exists.');
    const patch = cardPatch(card, original.position);
    const items = Object.fromEntries(
      Object.entries(patch.items ?? {}).filter(([id]) => !id.startsWith('link-')),
    );
    const root = items[card.id];
    if (root && typeof root === 'object') items[card.id] = { ...root, z: original.z };
    await this.editor.commitPatch({ items });
  }
  async add(card: Card) {
    const sourceRects = card.sources.flatMap((id) => {
      const r = this.rect(id);
      return r ? [r] : [];
    });
    const near = sourceRects[0] ?? { ...this.editor.viewCenter(), width: 0, height: 0 };
    const at = findSpace(
      this.all().flatMap((c) => {
        const r = this.rect(c.id);
        return r ? [r] : [];
      }),
      near,
      244,
      card.image ? 326 : 178,
    );
    const sourceSnapshots =
      card.sourceSnapshots ??
      this.all()
        .filter((source) => card.sources.includes(source.id))
        .map(({ id, kind, title, body }) => ({ id, kind, title, body }));
    await this.editor.commitPatch(cardPatch({ ...card, sourceSnapshots }, at));
    this.focus(card.id);
    if (!this.reduced) {
      this.effect = {
        x: at.x + 122,
        y: at.y + 70,
        started: performance.now(),
        sources: sourceRects,
      };
      const tick = () => {
        if (this.destroyed || !this.effect) return;
        this.stage.invalidate();
        if (performance.now() - this.effect.started < 850) this.raf = requestAnimationFrame(tick);
        else {
          this.effect = null;
          this.stage.invalidate();
        }
      };
      cancelAnimationFrame(this.raf);
      tick();
    }
  }
  hit(x: number, y: number) {
    return this.editor.itemAt(worldPoint(x, y));
  }
  destroy() {
    this.destroyed = true;
    clearInterval(this.idleTimer);
    cancelAnimationFrame(this.raf);
    for (const stop of this.stops) stop();
    this.stage.destroy();
    this.assets.destroy();
    this.editor.destroy();
  }
}
