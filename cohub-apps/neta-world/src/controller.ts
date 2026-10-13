import {
	buildFallbackShapeColors,
	createBoardRegistry,
	placeBoardOverlay,
	worldPoint,
	type BoardDocument,
	type Rect,
} from "@neta-art/cohub/board";
import {
	createBoardEditor,
	type BoardEditor,
} from "@neta-art/cohub/board/editor";
import {
	createBoardAssetManager,
	mountBoardStage,
	type BoardStage,
} from "@neta-art/cohub/board/stage";
import {
	defaultBoardPalette,
	ensureBoardTextMeasurement,
} from "@neta-art/cohub/board/render";
import {
	cardPatch,
	cardRoot,
	cards,
	creationNote,
	findSpace,
	readWork,
	WALKER,
	type Card,
} from "./world";
import { discoveryPatch, conversationCard } from "./discoveries";
import type { Run, Turn } from "./conversation";
import type { BoardPatch } from "@neta-art/cohub/board";
import { BoardMotion } from "./board-motion";
import { documentBase } from "./cohub";

export type WorldView = {
	document: BoardDocument;
	cards: Card[];
	selected: Card[];
	zoom: number;
	canUndo: boolean;
	canRedo: boolean;
	hover: string | null;
	gesture: boolean;
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
	readonly motion: BoardMotion;
	private active = true;
	private dark = false;
	private lastPair = "";
	private cachedDocument: BoardDocument | null = null;
	private cachedCards: Card[] = [];
	private remoteCommit: ((patch: BoardPatch) => Promise<void>) | null = null;
	private remoteFile: ((path: string) => Promise<string | null>) | null = null;
	private relatedDocument: BoardDocument | null = null;
	private relatedId = "";
	private relatedCards: Card[] = [];
	private hovered: string | null = null;
	get reduced() {
		return this.motion.reduced;
	}
	constructor(
		private host: HTMLElement,
		document: BoardDocument,
		private hooks: {
			change(view: WorldView): void;
			save(document: BoardDocument): void;
			inspect(ids: string[]): void;
			near(ids: string[]): void;
			suggest(ids: string[]): void;
			openWork(id: string): void;
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
					return root && root !== item.id
						? false
						: registry.hitTest(item, point);
				},
			},
			document,
			onCommit: async (patch) => {
				if (this.remoteCommit) {
					const remote = structuredClone(patch);
					for (const item of Object.values(remote.items ?? {})) {
						if (!item || typeof item !== "object") continue;
						const props = item.props as Record<string, unknown> | undefined;
						if (
							props &&
							typeof props === "object" &&
							!Array.isArray(props) &&
							typeof props.src === "string" &&
							/^art\/[a-z-]+\.webp$/.test(props.src)
						)
							props.src = new URL(props.src, documentBase()).href;
					}
					await this.remoteCommit(remote);
				} else hooks.save(this.editor.document);
			},
		});
		const resolveFileUrl = async (path: string) =>
			this.remoteFile
				? this.remoteFile(path)
				: /^(art\/[a-z-]+\.webp|scripts\/walker\.js)$/.test(path)
					? new URL(path, documentBase()).href
					: null;
		this.motion = new BoardMotion({
			item: (id) => this.editor.document.items[id],
			rect: (id) => this.rect(id),
			invalidate: () => this.stage?.invalidate(),
			dark: () => this.dark,
			active: () => this.active && !this.editor.gestureActive,
		});
		const interrupt = () => this.motion.finish();
		host.addEventListener("pointerdown", interrupt, { capture: true });
		host.addEventListener("wheel", interrupt, { capture: true, passive: true });
		this.stops.push(() => {
			host.removeEventListener("pointerdown", interrupt, true);
			host.removeEventListener("wheel", interrupt, true);
		});
		this.assets = createBoardAssetManager({ resolveFileUrl });
		this.stage = mountBoardStage(host, {
			editor: this.editor,
			assets: this.assets,
			source: { resolveFileUrl },
			previews: () => this.motion.previews,
			theme: () => ({
				key: this.dark ? "neta-dark" : "neta-light",
				colorScheme: this.dark ? "dark" : "light",
				palette: defaultBoardPalette(this.dark ? "dark" : "light"),
				colors: buildFallbackShapeColors(this.dark ? "dark" : "light"),
			}),
			safeRect: () => this.safeRect(),
			scriptCapabilities: {
				"world.destination": async (owner) => {
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
					const card =
						selected[0] ?? visible[this.visit++ % Math.max(1, visible.length)];
					const r = card && this.rect(card.id);
					const scale = Math.max(1, 1 / this.editor.camera.zoom);
					return r
						? { x: r.x - 52 * scale, y: r.y + r.height - 48 * scale }
						: null;
				},
				"world.drop": async (owner, input) => {
					if (
						owner !== WALKER ||
						!input ||
						typeof input !== "object" ||
						!("x" in input) ||
						!("y" in input) ||
						typeof input.x !== "number" ||
						typeof input.y !== "number"
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
				if (id) {
					const card = this.all().find((card) => card.id === id);
					if (readWork(card)) hooks.openWork(id);
					else hooks.inspect([id]);
				}
				return false;
			},
			drawOverlay: (g) => {
				for (const card of this.selected()) {
					const r = this.rect(card.id);
					if (r)
						g.roundRect(
							r.x - 5,
							r.y - 5,
							r.width + 10,
							r.height + 10,
							8,
						).stroke({
							color: 0x879c6c,
							width: 2 / this.editor.camera.zoom,
						});
				}
				this.motion.draw(g);
			},
		});
		this.stage.setScriptMode("interact");
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
				item.type === "arrow" &&
				"item" in item.props.start &&
				"item" in item.props.end &&
				visible.has(item.props.start.item) &&
				visible.has(item.props.end.item)
					? [[item.props.start.item, item.props.end.item]]
					: [],
			);
			const pair = pairs[this.visit % Math.max(1, pairs.length)];
			if (pair) hooks.suggest(pair);
		}, 25000);
		this.stops.push(
			this.editor.subscribe("hover", () => {
				const hover = this.editor.hoverId;
				const next = hover ? cardRoot(this.editor.document, hover) : null;
				if (next !== this.hovered) {
					this.hovered = next;
					this.notify();
				}
			}),
		);
		this.stops.push(
			this.editor.subscribe(
				["document", "selection", "camera", "history", "interaction"],
				() => this.notify(),
			),
		);
		this.stops.push(
			this.editor.subscribe("selection", () => {
				const ids = [
					...new Set(
						this.editor.selection.map(
							(id) => cardRoot(this.editor.document, id) ?? id,
						),
					),
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
				if (e.cancelled || e.operation !== "move") return;
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
					const pair = [id, neighbor.id].sort().join(":");
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
				this.editor.surfaceSize = {
					width: host.clientWidth,
					height: host.clientHeight,
				};
				this.fit();
				this.notify();
			}
		});
	}
	all() {
		if (this.cachedDocument !== this.editor.document) {
			this.cachedDocument = this.editor.document;
			this.cachedCards = cards(this.editor.document);
		}
		return this.cachedCards;
	}
	selected() {
		const ids = new Set(
			this.editor.selection.map((id) => cardRoot(this.editor.document, id)),
		);
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
	clientRect(id: string): DOMRect | null {
		const r = this.screenRect(id);
		if (!r) return null;
		const host = this.host.getBoundingClientRect();
		return new DOMRect(host.x + r.x, host.y + r.y, r.width, r.height);
	}
	layoutRect(): DOMRect {
		return (this.host.parentElement ?? this.host).getBoundingClientRect();
	}
	animateLayout(motion: import("./motion").MotionScope, from: DOMRect) {
		motion.move(this.host.parentElement ?? this.host, from);
	}
	overlay(id: string, size: { width: number; height: number }) {
		const anchor = this.screenRect(id);
		return anchor
			? placeBoardOverlay({ anchor, size, safeRect: this.safeRect(), gap: 20 })
			: null;
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
		this.stage.setScriptMode(paused ? "paused" : "interact");
	}
	private notify() {
		this.hooks.change({
			document: this.editor.document,
			cards: this.all(),
			selected: this.selected(),
			zoom: this.editor.camera.zoom,
			canUndo: this.editor.canUndo,
			canRedo: this.editor.canRedo,
			hover: this.hovered,
			gesture: this.editor.gestureActive,
		});
	}
	async update(card: Card) {
		const original = this.editor.document.items[card.id];
		if (!original) throw new Error("The source card no longer exists.");
		const patch = cardPatch(card, original.position);
		const items = Object.fromEntries(
			Object.entries(patch.items ?? {}).filter(
				([id]) => !id.startsWith("link-"),
			),
		);
		const root = items[card.id];
		if (root && typeof root === "object")
			items[card.id] = { ...root, z: original.z };
		await this.editor.commitPatch({ items });
	}
	async add(card: Card) {
		const sourceRects = card.sources.flatMap((id) => {
			const r = this.rect(id);
			return r ? [r] : [];
		});
		const near = sourceRects[0] ?? {
			...this.editor.viewCenter(),
			width: 0,
			height: 0,
		};
		const at = findSpace(
			this.all().flatMap((c) => {
				const r = this.rect(c.id);
				return r ? [r] : [];
			}),
			near,
			244,
			(card.image ? 326 : 178) + (card.creation ? 210 : 0),
		);
		const sourceSnapshots =
			card.sourceSnapshots ??
			this.all()
				.filter((source) => card.sources.includes(source.id))
				.map(({ id, kind, title, body }) => ({ id, kind, title, body }));
		const prepared = {
			...card,
			sourceSnapshots,
			...(card.creation
				? { creation: { ...card.creation, outputs: [card.id] } }
				: {}),
		};
		const patch = cardPatch(prepared, at);
		if (card.creation)
			Object.assign(
				patch.items ?? {},
				creationNote(prepared, { x: at.x, y: at.y + (card.image ? 350 : 210) })
					.items,
			);
		await this.editor.commitPatch(patch);
		this.focus(card.id);
		this.motion.reveal(
			card.creation ? [card.id, `note-${card.id}`] : [card.id],
			sourceRects,
		);
	}
	related(id: string): Card[] {
		if (this.relatedDocument === this.editor.document && this.relatedId === id)
			return this.relatedCards;
		this.relatedDocument = this.editor.document;
		this.relatedId = id;
		const linked = new Set<string>();
		for (const item of Object.values(this.editor.document.items)) {
			if (
				item.type !== "arrow" ||
				!("item" in item.props.start) ||
				!("item" in item.props.end)
			)
				continue;
			if (item.props.start.item === id) linked.add(item.props.end.item);
			if (item.props.end.item === id) linked.add(item.props.start.item);
		}
		this.relatedCards = this.all().filter((card) => linked.has(card.id));
		return this.relatedCards;
	}
	async buildConversation(sources: Card[]): Promise<string> {
		const card = conversationCard(sources);
		await this.add(card);
		return card.id;
	}
	async applyTurn(run: Run, turn: Turn): Promise<string[]> {
		if (!turn.discoveries.length) return [];
		const origin = this.rect(run.workId);
		if (!origin) throw new Error("The conversation work no longer exists.");
		const patch = discoveryPatch(this.editor.document, run, turn, origin);
		if (patch) {
			const ids = Object.keys(patch.items ?? {}).filter(
				(id) =>
					!this.editor.document.items[id] &&
					Boolean(
						patch.items?.[id] &&
							typeof patch.items[id] === "object" &&
							"metadata" in patch.items[id],
					),
			);
			await this.editor.commitPatch(patch);
			this.motion.reveal(ids, [origin]);
			return ids;
		} else if (!this.remoteCommit) this.hooks.save(this.editor.document);
		return [];
	}
	highlight(ids: string[]) {
		this.motion.read(ids);
	}
	setActive(active: boolean) {
		this.active = active;
		if (!active) this.motion.finish();
		this.stage.setActive(active);
	}
	connect(
		commit: (patch: BoardPatch) => Promise<void>,
		resolve: (path: string) => Promise<string | null>,
	) {
		this.motion.finish();
		this.remoteCommit = commit;
		this.remoteFile = resolve;
		this.stage.resetScripts();
	}
	disconnect() {
		this.remoteCommit = null;
		this.remoteFile = null;
		this.stage.resetScripts();
	}
	async refreshView() {
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => resolve()),
		);
		this.editor.surfaceSize = {
			width: this.host.clientWidth,
			height: this.host.clientHeight,
		};
		this.stage.invalidate();
	}
	hit(x: number, y: number) {
		return this.editor.itemAt(worldPoint(x, y));
	}
	destroy() {
		this.destroyed = true;
		clearInterval(this.idleTimer);
		this.motion.dispose();
		for (const stop of this.stops) stop();
		this.stage.destroy();
		this.assets.destroy();
		this.editor.destroy();
	}
}
