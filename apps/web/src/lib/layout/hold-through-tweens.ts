const LAYOUT_PROPERTIES = new Set([
	"width",
	"flex-grow",
	"flex-basis",
	"grid-template-columns",
]);

const END_EPSILON_MS = 0.01;

function runningLayoutTweens(container: HTMLElement) {
	return document.getAnimations().filter((animation) => {
		if (!(animation instanceof CSSTransition)) return false;
		if (animation.playState !== "running") return false;
		const target =
			animation.effect instanceof KeyframeEffect
				? animation.effect.target
				: null;
		return (
			LAYOUT_PROPERTIES.has(animation.transitionProperty) &&
			!(target && container.contains(target))
		);
	});
}

/** Holds panel content at its end width while neighbouring panels tween, so it lays out once. */
export function holdContentThroughTweens(panel: HTMLElement) {
	let scheduled = false;
	let generation = 0;

	const hold = () => {
		scheduled = false;
		const tweens = runningLayoutTweens(panel);
		if (tweens.length === 0) return;
		const start = panel.getBoundingClientRect();
		const times = tweens.map((animation) => animation.currentTime);
		for (const animation of tweens) {
			const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);
			animation.currentTime = Math.max(0, end - END_EPSILON_MS);
		}
		const end = panel.getBoundingClientRect();
		const endWidth = panel.clientWidth;
		tweens.forEach((animation, index) => {
			animation.currentTime = times[index] ?? null;
		});
		if (end.left === start.left && end.right === start.right) return;

		const width = endWidth > 0 ? endWidth : panel.clientWidth;
		const edge =
			Math.abs(end.left - start.left) <= Math.abs(end.right - start.right)
				? "start"
				: "end";
		const current = ++generation;
		panel.style.setProperty("--held-content-width", `${width}px`);
		panel.dataset.holdEdge = edge;
		void Promise.allSettled(tweens.map((animation) => animation.finished)).then(
			() => {
				if (current !== generation) return;
				panel.style.removeProperty("--held-content-width");
				delete panel.dataset.holdEdge;
			},
		);
	};

	const onTransitionRun = (event: TransitionEvent) => {
		if (scheduled || !LAYOUT_PROPERTIES.has(event.propertyName)) return;
		if (event.target instanceof Node && panel.contains(event.target)) return;
		scheduled = true;
		queueMicrotask(hold);
	};

	document.addEventListener("transitionrun", onTransitionRun);
	return () => {
		document.removeEventListener("transitionrun", onTransitionRun);
		generation += 1;
		panel.style.removeProperty("--held-content-width");
		delete panel.dataset.holdEdge;
	};
}
