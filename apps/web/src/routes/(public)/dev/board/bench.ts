import type { BoardStage } from "@neta-art/cohub/board/stage";

type BenchPhase = {
	name: string;
	frames: number;
	wheel: { deltaX?: number; deltaY?: number; ctrlKey?: boolean };
	rest?: number;
};

type Percentiles = { p50: number; p95: number; max: number };

export type BenchPhaseReport = {
	name: string;
	frame: Percentiles;
	work: Percentiles;
	long: number;
	shown: number;
	ready: number;
	loaded: number;
};

type Settled = Pick<BenchPhaseReport, "shown" | "ready" | "loaded">;

export type BenchReport = {
	open: Settled;
	phases: BenchPhaseReport[];
};

const STEP: BenchPhase = {
	name: "step",
	frames: 1,
	rest: 3_000,
	wheel: { deltaY: 960 },
};
const PHASES: BenchPhase[] = [
	{ name: "zoom in", frames: 15, wheel: { deltaY: -10, ctrlKey: true } },
	{ name: "close", frames: 12, wheel: { deltaY: -10, ctrlKey: true } },
	STEP,
	STEP,
	STEP,
	{ name: "pan close", frames: 60, wheel: { deltaX: -24, deltaY: 16 } },
	{ name: "zoom out", frames: 12, wheel: { deltaY: 10, ctrlKey: true } },
	{ name: "pan", frames: 120, wheel: { deltaX: 24 } },
	{ name: "overview", frames: 16, wheel: { deltaY: 10, ctrlKey: true } },
];

const SETTLE_LIMIT_MS = 20_000;

function percentiles(values: number[]): Percentiles {
	const sorted = values.toSorted((a, b) => a - b);
	const at = (ratio: number) =>
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
	return { p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
}

let frameWork = 0;
let instrumented = false;

export function instrumentFrames() {
	if (instrumented) return;
	instrumented = true;
	const request = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = (callback) =>
		request((time) => {
			const start = performance.now();
			try {
				callback(time);
			} finally {
				frameWork += performance.now() - start;
			}
		});
}

const nextFrame = () =>
	new Promise<number>((resolve) => requestAnimationFrame(resolve));

async function settle(stage: BoardStage, since: number): Promise<Settled> {
	const times: Partial<Settled> = {};
	for (;;) {
		const now = await nextFrame();
		const { waiting, settling, loading } = stage.stats();
		const at = now - since;
		if (times.shown === undefined && waiting === 0) times.shown = at;
		if (times.ready === undefined && !settling) times.ready = at;
		if (times.loaded === undefined && !settling && loading === 0)
			times.loaded = at;
		if (times.loaded !== undefined || at >= SETTLE_LIMIT_MS)
			return {
				shown: times.shown ?? SETTLE_LIMIT_MS,
				ready: times.ready ?? SETTLE_LIMIT_MS,
				loaded: times.loaded ?? SETTLE_LIMIT_MS,
			};
	}
}

export async function runBoardBench(
	stage: BoardStage,
	openedAt: number,
): Promise<BenchReport> {
	const canvas = stage.renderer?.canvas as HTMLCanvasElement | undefined;
	if (!canvas) throw new Error("Board stage has no canvas.");
	const open = await settle(stage, openedAt);
	const rect = canvas.getBoundingClientRect();
	const phases: BenchPhaseReport[] = [];
	for (const phase of PHASES) {
		if (phase.rest)
			await new Promise((resolve) => setTimeout(resolve, phase.rest));
		const intervals: number[] = [];
		const work: number[] = [];
		let previous = await nextFrame();
		for (let frame = 0; frame < phase.frames; frame += 1) {
			canvas.dispatchEvent(
				new WheelEvent("wheel", {
					bubbles: true,
					cancelable: true,
					clientX: rect.left + rect.width / 2,
					clientY: rect.top + rect.height / 2,
					...phase.wheel,
				}),
			);
			frameWork = 0;
			const now = await nextFrame();
			work.push(frameWork);
			intervals.push(now - previous);
			previous = now;
		}
		phases.push({
			name: phase.name,
			frame: percentiles(intervals),
			work: percentiles(work),
			long: intervals.filter((interval) => interval > 50).length,
			...(await settle(stage, previous)),
		});
	}
	return { open, phases };
}
