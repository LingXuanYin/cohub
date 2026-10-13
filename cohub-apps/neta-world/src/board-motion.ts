import type { BoardItem, Rect } from "@neta-art/cohub/board";
import type { Graphics } from "pixi.js";

export const MOTION_LIMITS = {
	cards: 8,
	sources: 6,
	particles: 48,
	tiles: 48,
	fps: 30,
	duration: 1050,
} as const;
export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export const easeOut = (value: number) => 1 - (1 - clamp(value)) ** 4;
export function revealItem(
	item: BoardItem,
	elapsed: number,
	delay = 0,
): BoardItem {
	const progress = easeOut((elapsed - delay) / 540);
	const factor = 0.92 + progress * 0.08;
	const scale =
		typeof item.scale === "number"
			? item.scale * factor
			: { x: item.scale.x * factor, y: item.scale.y * factor };
	return {
		...item,
		opacity: item.opacity * clamp((elapsed - delay) / 240),
		scale,
		position: { x: item.position.x, y: item.position.y + (1 - progress) * 20 },
	};
}
export function tileAlpha(index: number, elapsed: number, delay = 0) {
	const rank = (index * 17) % MOTION_LIMITS.tiles;
	return 1 - easeOut((elapsed - delay - 100 - rank * 8) / 180);
}
export function particlePoint(
	from: Rect,
	to: Rect,
	elapsed: number,
	index: number,
) {
	const progress = clamp((elapsed - index * 11) / 650);
	const x = from.x + from.width / 2,
		y = from.y + from.height / 2;
	return {
		x: x + (to.x + to.width / 2 - x) * easeOut(progress),
		y:
			y +
			(to.y + to.height / 2 - y) * progress -
			Math.sin(progress * Math.PI) * 52,
		alpha: Math.sin(progress * Math.PI) * 0.8,
	};
}

type Birth = { ids: string[]; sources: Rect[]; started: number };
export class BoardMotion {
	readonly previews = new Map<string, BoardItem>();
	private birth: Birth | null = null;
	private highlight: { ids: string[]; started: number } | null = null;
	private frame = 0;
	private last = 0;
	private disposed = false;
	private media = matchMedia("(prefers-reduced-motion: reduce)");
	private settle = () => this.finish();
	private visibility = () => {
		if (document.hidden) this.finish();
	};
	constructor(
		private options: {
			item(id: string): BoardItem | undefined;
			rect(id: string): Rect | null;
			invalidate(): void;
			dark(): boolean;
			active(): boolean;
		},
	) {
		this.media.addEventListener("change", this.settle);
		document.addEventListener("visibilitychange", this.visibility);
	}
	get reduced() {
		return this.media.matches;
	}
	reveal(ids: string[], sources: Rect[] = []) {
		this.finish();
		if (
			this.disposed ||
			this.reduced ||
			document.hidden ||
			!this.options.active()
		)
			return;
		this.birth = {
			ids: [...new Set(ids)].slice(0, MOTION_LIMITS.cards),
			sources: sources.slice(0, MOTION_LIMITS.sources),
			started: performance.now(),
		};
		this.sample(this.birth.started);
		this.schedule();
	}
	read(ids: string[]) {
		if (
			this.disposed ||
			this.reduced ||
			document.hidden ||
			!this.options.active()
		)
			return;
		this.highlight = {
			ids: [...new Set(ids)].slice(0, MOTION_LIMITS.sources),
			started: performance.now(),
		};
		this.schedule();
	}
	finish() {
		cancelAnimationFrame(this.frame);
		this.frame = 0;
		const dirty = Boolean(this.birth || this.highlight || this.previews.size);
		this.birth = null;
		this.highlight = null;
		this.previews.clear();
		if (dirty && !this.disposed) this.options.invalidate();
	}
	private schedule() {
		if (!this.frame) this.frame = requestAnimationFrame(this.tick);
	}
	private tick = (now: number) => {
		this.frame = 0;
		if (this.disposed) return;
		if (document.hidden || this.reduced || !this.options.active()) {
			this.finish();
			return;
		}
		if (now - this.last >= 1000 / MOTION_LIMITS.fps) {
			this.last = now;
			this.sample(now);
		}
		if (this.birth || this.highlight) this.schedule();
	};
	private sample(now: number) {
		this.previews.clear();
		if (this.birth) {
			const elapsed = now - this.birth.started;
			if (elapsed >= MOTION_LIMITS.duration) this.birth = null;
			else
				this.birth.ids.forEach((id, index) => {
					const item = this.options.item(id);
					if (item)
						this.previews.set(id, revealItem(item, elapsed, index * 55));
				});
		}
		if (this.highlight && now - this.highlight.started > 900)
			this.highlight = null;
		this.options.invalidate();
	}
	draw(g: Graphics, now = performance.now()) {
		const highlight = this.highlight;
		if (highlight) {
			const progress = clamp((now - highlight.started) / 900);
			for (const id of highlight.ids) {
				const r = this.options.rect(`${id}-body`) ?? this.options.rect(id);
				if (r)
					g.roundRect(r.x - 5, r.y - 3, r.width + 10, r.height + 6, 3).fill({
						color: 0x91a66c,
						alpha: Math.sin(progress * Math.PI) * 0.17,
					});
			}
		}
		const birth = this.birth;
		if (!birth) return;
		const elapsed = now - birth.started;
		const first = birth.ids[0];
		const target = first ? this.options.rect(first) : null;
		if (target) {
			const perSource = Math.floor(
				MOTION_LIMITS.particles / Math.max(1, birth.sources.length),
			);
			for (const source of birth.sources)
				for (let i = 0; i < perSource; i++) {
					const p = particlePoint(source, target, elapsed, i);
					if (p.alpha > 0.001)
						g.rect(p.x, p.y, 4, 4).fill({
							color: i % 3 === 0 ? 0xb68c56 : 0x81976a,
							alpha: p.alpha,
						});
				}
			const progress = clamp(elapsed / MOTION_LIMITS.duration);
			g.circle(
				target.x + target.width / 2,
				target.y + 65,
				12 + progress * 42,
			).stroke({
				color: 0xb68c56,
				width: 1.5,
				alpha: (1 - progress) * 0.45,
			});
		}
		birth.ids.forEach((id, order) => {
			const card = this.options.rect(id);
			const localTime = elapsed - order * 55;
			if (card && localTime >= 0 && localTime < 240) {
				const p = clamp(localTime / 240),
					size = 6 + p * 12;
				g.rect(
					card.x + card.width / 2 - size / 2,
					card.y + 65 - size / 2,
					size,
					size,
				).fill({
					color: 0x81976a,
					alpha: (1 - p) * 0.8,
				});
			}
			const image = this.options.rect(`${id}-image`);
			if (!image) return;
			const tw = image.width / 8,
				th = image.height / 6;
			for (let i = 0; i < MOTION_LIMITS.tiles; i++) {
				const alpha = tileAlpha(i, elapsed, order * 55);
				if (alpha > 0.001)
					g.rect(
						image.x + (i % 8) * tw,
						image.y + Math.floor(i / 8) * th,
						tw + 0.3,
						th + 0.3,
					).fill({ color: this.options.dark() ? 0x262d27 : 0xfcfbf6, alpha });
			}
		});
	}
	dispose() {
		this.finish();
		this.disposed = true;
		this.media.removeEventListener("change", this.settle);
		document.removeEventListener("visibilitychange", this.visibility);
	}
}
