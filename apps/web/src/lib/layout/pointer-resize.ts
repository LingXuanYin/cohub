export type ResizeSession = {
	move: (dx: number) => void;
	end: (completed: boolean) => void;
};

export type ResizeStart = () => ResizeSession | null;

const PANEL_RESIZING_CLASS = "panel-resizing";
const LAYOUT_RESIZING_CLASS = "layout-resizing";

let activeCancel: (() => void) | null = null;

export function trackPointerResize(
	event: PointerEvent,
	start: ResizeStart,
): (() => void) | null {
	if (event.button !== 0 || !event.isPrimary || activeCancel) return null;
	const target = event.currentTarget;
	if (!(target instanceof Element)) return null;
	const session = start();
	if (!session) return null;
	event.preventDefault();
	event.stopPropagation();

	const { pointerId, clientX: startX } = event;
	let pendingDx: number | null = null;
	let frame = 0;

	const flush = () => {
		frame = 0;
		if (pendingDx === null) return;
		const dx = pendingDx;
		pendingDx = null;
		session.move(dx);
	};
	const finish = (completed: boolean) => {
		if (activeCancel !== cancel) return;
		activeCancel = null;
		cancelAnimationFrame(frame);
		flush();
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
		window.removeEventListener("pointercancel", onCancel);
		window.removeEventListener("blur", cancel);
		target.removeEventListener("lostpointercapture", onCancel as EventListener);
		if (target.hasPointerCapture(pointerId)) {
			target.releasePointerCapture(pointerId);
		}
		document.body.classList.remove(PANEL_RESIZING_CLASS, LAYOUT_RESIZING_CLASS);
		session.end(completed);
	};
	const cancel = () => finish(false);
	const onMove = (moveEvent: PointerEvent) => {
		if (moveEvent.pointerId !== pointerId) return;
		if (moveEvent.pointerType === "mouse" && moveEvent.buttons === 0) {
			cancel();
			return;
		}
		pendingDx = moveEvent.clientX - startX;
		frame ||= requestAnimationFrame(flush);
	};
	const onUp = (upEvent: PointerEvent) => {
		if (upEvent.pointerId === pointerId) finish(true);
	};
	const onCancel = (cancelEvent: PointerEvent) => {
		if (cancelEvent.pointerId === pointerId) cancel();
	};

	activeCancel = cancel;
	window.addEventListener("pointermove", onMove);
	window.addEventListener("pointerup", onUp);
	window.addEventListener("pointercancel", onCancel);
	window.addEventListener("blur", cancel);
	target.addEventListener("lostpointercapture", onCancel as EventListener);
	try {
		target.setPointerCapture(pointerId);
	} catch {
		// Best-effort; window listeners still track the gesture.
	}
	document.body.classList.add(PANEL_RESIZING_CLASS, LAYOUT_RESIZING_CLASS);
	return cancel;
}

export function stepResize(start: ResizeStart, dx: number) {
	const session = start();
	if (!session) return;
	session.move(dx);
	session.end(true);
}

export function pauseLayoutTweensOnWindowResize(settleMs = 160) {
	let timer = 0;
	const onResize = () => {
		document.body.classList.add(LAYOUT_RESIZING_CLASS);
		window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			if (!activeCancel) document.body.classList.remove(LAYOUT_RESIZING_CLASS);
		}, settleMs);
	};
	window.addEventListener("resize", onResize);
	return () => {
		window.removeEventListener("resize", onResize);
		window.clearTimeout(timer);
	};
}
