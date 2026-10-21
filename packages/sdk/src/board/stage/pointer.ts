import {
	type BoardDrawInputSample,
	type BoardViewport,
	pointToWorld,
	screenPoint,
} from "../model/index.js";
import type { BoardPointerEvent } from "../editor/index.js";

function pressureOf(event: PointerEvent): number {
	return event.pointerType === "pen" && event.pressure > 0
		? event.pressure
		: 0.5;
}

export function elementClientToLocal(element: HTMLElement) {
	let matrix = new DOMMatrix();
	for (let node: HTMLElement | null = element; node; node = node.parentElement) {
		const transform = getComputedStyle(node).transform;
		if (transform !== "none") matrix = new DOMMatrix(transform).multiply(matrix);
	}
	const rect = element.getBoundingClientRect();
	const { a, b, c, d } = matrix;
	const width = element.offsetWidth;
	const height = element.offsetHeight;
	const x = rect.left - Math.min(0, a * width, c * height, a * width + c * height);
	const y = rect.top - Math.min(0, b * width, d * height, b * width + d * height);
	const determinant = a * d - b * c;
	return (clientX: number, clientY: number) => determinant === 0
		? screenPoint(0, 0)
		: screenPoint(
			(d * (clientX - x) - c * (clientY - y)) / determinant - element.clientLeft,
			(a * (clientY - y) - b * (clientX - x)) / determinant - element.clientTop,
		);
}

export function toBoardPointerEvent(
	event: PointerEvent,
	rect: DOMRect | HTMLElement,
	camera: BoardViewport,
	coalesce = false,
): BoardPointerEvent {
	const local = "getBoundingClientRect" in rect
		? elementClientToLocal(rect)
		: (x: number, y: number) => screenPoint(x - rect.left, y - rect.top);
	const screen = local(event.clientX, event.clientY);
	const coalesced = coalesce ? event.getCoalescedEvents?.() : undefined;
	const samples: BoardDrawInputSample[] | undefined =
		coalesced && coalesced.length > 1
			? coalesced.map((sample) => ({
					world: pointToWorld(local(sample.clientX, sample.clientY), camera),
					pressure: pressureOf(sample),
				}))
			: undefined;
	return {
		pointerId: event.pointerId,
		screen,
		world: pointToWorld(screen, camera),
		shiftKey: event.shiftKey,
		metaKey: event.metaKey,
		ctrlKey: event.ctrlKey,
		altKey: event.altKey,
		button: event.button,
		buttons: event.buttons,
		pointerType: event.pointerType,
		cancelled:
			event.type === "pointercancel" || event.type === "lostpointercapture",
		pressure: pressureOf(event),
		...(samples ? { samples } : {}),
	};
}
