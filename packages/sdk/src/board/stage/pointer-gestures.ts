type BoardPointerGestureHandlers = {
	move(event: PointerEvent): void;
	end(event: PointerEvent): void;
};

export function createBoardPointerGestures(host: HTMLElement, handlers: BoardPointerGestureHandlers) {
	const document = host.ownerDocument;
	const window = document.defaultView;
	const pointers = new Map<number, PointerEvent>();

	function listen(active: boolean) {
		const method = active ? "addEventListener" : "removeEventListener";
		document[method]("pointermove", move as EventListener, true);
		document[method]("pointerup", end as EventListener, true);
		document[method]("pointercancel", end as EventListener, true);
		host[method]("lostpointercapture", lost as EventListener);
		window?.[method]("blur", cancel);
		document[method]("visibilitychange", visibility);
	}

	function move(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return;
		pointers.set(event.pointerId, event);
		handlers.move(event);
	}

	function end(event: PointerEvent) {
		if (!pointers.delete(event.pointerId)) return;
		if (pointers.size === 0) listen(false);
		if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
		handlers.end(event);
	}

	function lost(event: PointerEvent) {
		if (event.target === host && event.pointerType !== "mouse") end(event);
	}

	function cancel() {
		if (!window) return;
		for (const event of [...pointers.values()]) end(new window.PointerEvent("pointercancel", event));
	}

	function visibility() {
		if (document.hidden) cancel();
	}

	return {
		has: (pointerId: number) => pointers.has(pointerId),
		start(event: PointerEvent) {
			host.setPointerCapture(event.pointerId);
			if (pointers.size === 0) listen(true);
			pointers.set(event.pointerId, event);
		},
		cancel,
	};
}
