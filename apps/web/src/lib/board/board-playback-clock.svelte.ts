import type { BoardDocument, BoardPlaybackSnapshot } from "@cohub/protocol";
import { playbackClockAt } from "@neta-art/cohub/board/player";

export function followBoardPlayback(
	source: () => {
		playback: BoardPlaybackSnapshot | null;
		document: BoardDocument;
	},
) {
	let time = $state(0);
	let advancing = $state(false);
	let snapshot = $state.raw<BoardPlaybackSnapshot | null>(null);

	$effect(() => {
		const { playback, document } = source();
		if (playback?.status !== "playing") {
			snapshot = playback;
			advancing = false;
			return;
		}
		let frame = 0;
		const tick = () => {
			const state = playbackClockAt(playback, document, Date.now());
			time = state.time ?? 0;
			advancing = state.advancing;
			snapshot = playback;
			frame = state.advancing ? requestAnimationFrame(tick) : 0;
		};
		tick();
		return () => cancelAnimationFrame(frame);
	});

	return {
		get time() {
			return time;
		},
		get advancing() {
			return advancing;
		},
		get snapshot() {
			return snapshot;
		},
	};
}
