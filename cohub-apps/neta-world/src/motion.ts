export class MotionScope {
	private animations = new Set<Animation>();
	private cleanups = new Set<() => void>();
	private media = matchMedia("(prefers-reduced-motion: reduce)");
	private disposed = false;
	private stop = () => this.finish();
	private visibility = () => {
		if (document.hidden) this.finish();
	};
	constructor() {
		this.media.addEventListener("change", this.stop);
		document.addEventListener("visibilitychange", this.visibility);
	}
	get reduced() {
		return this.media.matches || document.hidden || this.disposed;
	}
	animate(
		element: Element,
		frames: Keyframe[],
		options: KeyframeAnimationOptions,
	): Promise<void> {
		if (!element.isConnected || this.reduced || this.animations.size >= 48)
			return Promise.resolve();
		let animation: Animation;
		try {
			animation = element.animate(frames, {
				easing: "cubic-bezier(.16,1,.3,1)",
				...options,
			});
		} catch {
			return Promise.resolve();
		}
		this.animations.add(animation);
		return animation.finished
			.catch(() => undefined)
			.then(() => {
				this.animations.delete(animation);
				animation.cancel();
			});
	}
	own(cleanup: () => void) {
		this.cleanups.add(cleanup);
		return () => {
			this.cleanups.delete(cleanup);
			cleanup();
		};
	}
	finish() {
		for (const animation of this.animations) {
			try {
				animation.finish();
			} catch {
				animation.cancel();
			}
		}
		this.animations.clear();
		for (const cleanup of this.cleanups) cleanup();
		this.cleanups.clear();
	}
	dispose() {
		this.disposed = true;
		this.finish();
		this.media.removeEventListener("change", this.stop);
		document.removeEventListener("visibilitychange", this.visibility);
	}
	move(
		element: HTMLElement,
		from: DOMRect | { x: number; y: number; width: number; height: number },
		duration = 520,
	) {
		if (this.reduced) return;
		const to = element.getBoundingClientRect();
		if (!to.width || !to.height || !from.width || !from.height) return;
		const x = from.x - to.x,
			y = from.y - to.y;
		const sx = from.width / to.width,
			sy = from.height / to.height;
		void this.animate(
			element,
			[
				{
					transformOrigin: "0 0",
					transform: `translate(${x}px,${y}px) scale(${sx},${sy})`,
				},
				{ transformOrigin: "0 0", transform: "none" },
			],
			{ duration },
		);
	}
	portal(from: DOMRect, to: DOMRect, title: string) {
		if (this.reduced || !from.width || !from.height || !to.width || !to.height)
			return;
		const ghost = document.createElement("div");
		ghost.className = "motion-portal";
		ghost.setAttribute("aria-hidden", "true");
		ghost.textContent = title;
		Object.assign(ghost.style, {
			left: `${from.x}px`,
			top: `${from.y}px`,
			width: `${from.width}px`,
			height: `${from.height}px`,
		});
		(document.querySelector(".app") ?? document.body).appendChild(ghost);
		const remove = this.own(() => ghost.remove());
		void this.animate(
			ghost,
			[
				{ transform: "none", opacity: 0.8, transformOrigin: "0 0" },
				{
					transform: `translate(${to.x - from.x}px,${to.y - from.y}px) scale(${to.width / from.width},${to.height / from.height})`,
					opacity: 0,
					transformOrigin: "0 0",
				},
			],
			{ duration: 420 },
		).then(remove);
	}
	fly(
		from: DOMRect,
		to: DOMRect,
		color = "var(--accent)",
		kind: "toss" | "pull" | "stomp" | "spit" = "toss",
		delay = 0,
	) {
		if (this.reduced) return;
		const fragment = document.createElement("i");
		fragment.className = "motion-fragment";
		fragment.setAttribute("aria-hidden", "true");
		const x = from.x + from.width / 2,
			y = from.y + from.height / 2;
		const dx = to.x + Math.min(28, to.width / 2) - x,
			dy = to.y + to.height / 2 - y;
		Object.assign(fragment.style, {
			left: `${x}px`,
			top: `${y}px`,
			background: color,
		});
		(document.querySelector(".app") ?? document.body).appendChild(fragment);
		const remove = this.own(() => fragment.remove());
		const middle: Record<typeof kind, string> = {
			toss: `translate(${dx * 0.4}px,${dy * 0.25 - 45}px) rotate(100deg) scale(1.1)`,
			pull: "translate(0,-30px) scale(1.3)",
			stomp: `translate(${dx}px,${dy - 24}px) scale(1.15)`,
			spit: `translate(${dx * 0.3}px,${dy * 0.2 - 12}px) scale(.8)`,
		};
		void this.animate(
			fragment,
			[
				{ transform: "scale(.25)", opacity: 0 },
				{ transform: middle[kind], opacity: 1, offset: 0.45 },
				{
					transform: `translate(${dx}px,${dy}px) rotate(180deg) scale(.55)`,
					opacity: 0,
				},
			],
			{ duration: 520, delay, easing: "steps(10)" },
		).then(remove);
	}
}

export function entrance(
	node: HTMLElement,
	options: { delay?: number; duration?: number } = {},
) {
	const motion = new MotionScope();
	void motion.animate(
		node,
		[
			{ opacity: 0, transform: "translateY(10px)" },
			{ opacity: 1, transform: "none" },
		],
		{ duration: options.duration ?? 300, delay: options.delay ?? 0 },
	);
	return { destroy: () => motion.dispose() };
}
