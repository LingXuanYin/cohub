import { BOARD_INPUT, boardDragSlop, isTouchLikePointer } from "../editor/index.js";

export type BoardStagePress = {
	pointerId: number;
	pointerType: string;
	clientX: number;
	clientY: number;
};

export function boardStagePress(event: PointerEvent): BoardStagePress {
	return { pointerId: event.pointerId, pointerType: event.pointerType, clientX: event.clientX, clientY: event.clientY };
}

const travel = (press: BoardStagePress, event: PointerEvent) => Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY);

export function createBoardLongPress(fire: (press: BoardStagePress) => void) {
	let pending: { press: BoardStagePress; timer: ReturnType<typeof setTimeout> } | null = null;
	const cancel = () => {
		if (pending) clearTimeout(pending.timer);
		pending = null;
	};
	return {
		start(event: PointerEvent) {
			if (pending) return cancel();
			if (!isTouchLikePointer(event.pointerType) || event.button !== 0) return;
			const press = boardStagePress(event);
			pending = {
				press,
				timer: setTimeout(() => {
					pending = null;
					fire(press);
				}, BOARD_INPUT.longPressMs),
			};
		},
		move(event: PointerEvent) {
			if (pending && event.pointerId === pending.press.pointerId && travel(pending.press, event) > boardDragSlop(event.pointerType)) cancel();
		},
		end(event: PointerEvent) {
			if (pending?.press.pointerId === event.pointerId) cancel();
		},
		cancel,
	};
}

export function createBoardTouchTaps(handlers: { doubleTap(press: BoardStagePress): void; multiTap(fingers: number): void }) {
	const fingers = new Map<number, BoardStagePress>();
	let started = 0;
	let most = 0;
	let moved = false;
	let previous: (BoardStagePress & { at: number }) | null = null;

	return {
		down(event: PointerEvent) {
			if (!isTouchLikePointer(event.pointerType)) return;
			if (fingers.size === 0) {
				started = performance.now();
				most = 0;
				moved = false;
			}
			fingers.set(event.pointerId, boardStagePress(event));
			most = Math.max(most, fingers.size);
		},
		move(event: PointerEvent) {
			const finger = fingers.get(event.pointerId);
			if (finger && travel(finger, event) > boardDragSlop(event.pointerType)) moved = true;
		},
		up(event: PointerEvent, cancelled: boolean) {
			const finger = fingers.get(event.pointerId);
			if (!finger || !fingers.delete(event.pointerId) || fingers.size > 0) return;
			const now = performance.now();
			const quick = now - started <= (most > 1 ? BOARD_INPUT.multiTapMs : BOARD_INPUT.tapMs);
			if (cancelled || moved || !quick) {
				previous = null;
				return;
			}
			if (most > 1) {
				previous = null;
				if (most <= 3) handlers.multiTap(most);
				return;
			}
			const second =
				previous &&
				started - previous.at <= BOARD_INPUT.doubleTapMs &&
				Math.hypot(finger.clientX - previous.clientX, finger.clientY - previous.clientY) <= BOARD_INPUT.doubleTapSlop;
			previous = second ? null : { ...finger, at: now };
			if (second) handlers.doubleTap(finger);
		},
		cancel() {
			fingers.clear();
			previous = null;
		},
	};
}

export function createGhostClickGuard(view: Window | null) {
	let disarm: (() => void) | null = null;
	return {
		arm() {
			disarm?.();
			if (!view) return;
			const drop = (event: Event) => {
				event.preventDefault();
				event.stopImmediatePropagation();
				disarm?.();
			};
			const timer = setTimeout(() => disarm?.(), BOARD_INPUT.ghostClickMs);
			view.addEventListener("click", drop, true);
			disarm = () => {
				clearTimeout(timer);
				view.removeEventListener("click", drop, true);
				disarm = null;
			};
		},
		dispose: () => disarm?.(),
	};
}
