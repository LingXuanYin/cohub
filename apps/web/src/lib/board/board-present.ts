export function enterPresentationFullscreen(element: HTMLElement) {
	if (document.fullscreenElement || !element.requestFullscreen) return;
	void element.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
}

export function holdPresentation(
	element: HTMLElement,
	onLeave: () => void,
): () => void {
	let lock: WakeLockSentinel | null = null;
	let held = true;
	let filled = document.fullscreenElement === element;

	const acquire = () => {
		if (
			!navigator.wakeLock ||
			document.visibilityState !== "visible" ||
			(lock && !lock.released)
		)
			return;
		navigator.wakeLock
			.request("screen")
			.then((sentinel) => {
				if (held) lock = sentinel;
				else void sentinel.release();
			})
			.catch(() => {});
	};
	const fullscreenChange = () => {
		const now = document.fullscreenElement === element;
		if (filled && !now) onLeave();
		filled = now;
	};

	acquire();
	document.addEventListener("visibilitychange", acquire);
	document.addEventListener("fullscreenchange", fullscreenChange);
	return () => {
		held = false;
		document.removeEventListener("visibilitychange", acquire);
		document.removeEventListener("fullscreenchange", fullscreenChange);
		void lock?.release().catch(() => {});
		if (document.fullscreenElement === element)
			void document.exitFullscreen().catch(() => {});
	};
}
