export const MOTION_SCRIPT_PREFIX = "dev/scripts/";

const SCRIPTS: Record<string, string> = {
	"counter.js": `export const parameters = {
  label: { type: "string", label: "Label", default: "Tap to count" },
  color: { type: "color", label: "Color", default: "#e67845" },
  step: { type: "number", label: "Step", default: 1, min: 1, max: 10, step: 1 },
  rounded: { type: "boolean", label: "Rounded", default: true },
};

export default function (ctx) {
  ctx.state.count ??= 0;
  ctx.hitRegions({ button: { target: "self", label: "Count", cursor: "pointer" } });
  ctx.on("click", () => {
    ctx.state.count += ctx.params.step;
    ctx.invalidate();
  });
}

export function draw(g, { width, height, params, state }) {
  g.fillStyle = params.color;
  g.beginPath();
  g.roundRect(0, 0, width, height, params.rounded ? height / 2 : 6);
  g.fill();
  g.fillStyle = "#fff";
  g.font = "600 20px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(params.label + " · " + (state.count ?? 0), width / 2, height / 2);
}
`,
	"slider.js": `export const parameters = {
  color: { type: "color", label: "Color", default: "#4c8dff" },
};

export default function (ctx) {
  ctx.state.value ??= 0.4;
  let dragging = false;
  const set = (event) => {
    ctx.state.value = Math.min(1, Math.max(0, event.point.x / ctx.self.base.size.width));
    ctx.invalidate();
  };
  ctx.hitRegions({ track: { target: "self", label: "Slider", cursor: "ew-resize" } });
  ctx.on("pointerdown", (event) => { dragging = true; set(event); });
  ctx.on("pointermove", (event) => { if (dragging) set(event); });
  ctx.on("pointerup", () => { dragging = false; });
  ctx.on("pointercancel", () => { dragging = false; });
}

export function draw(g, { width, height, params, state }) {
  const value = state.value ?? 0.4;
  g.fillStyle = "rgba(127,127,127,0.25)";
  g.beginPath();
  g.roundRect(0, height / 2 - 6, width, 12, 6);
  g.fill();
  g.fillStyle = params.color;
  g.beginPath();
  g.roundRect(0, height / 2 - 6, width * value, 12, 6);
  g.fill();
  g.beginPath();
  g.arc(width * value, height / 2, 16, 0, Math.PI * 2);
  g.fill();
}
`,
	"broken.js": `export default function () {
  const missing = undefined;
  return missing.point.x;
}
`,
};

export function motionScriptUrl(path: string): string | null {
	if (!path.startsWith(MOTION_SCRIPT_PREFIX)) return null;
	const source = SCRIPTS[path.slice(MOTION_SCRIPT_PREFIX.length)];
	return source === undefined
		? null
		: `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
}

const script = (name: string) => ({ src: `${MOTION_SCRIPT_PREFIX}${name}` });

export function motionItems(stress = 0): Record<string, unknown> {
	const dots: Record<string, unknown> = {};
	for (let index = 0; index < stress; index += 1)
		dots[`dot-${index}`] = {
			type: "shape",
			position: { x: (index % 40) * 24, y: 340 + Math.floor(index / 40) * 24 },
			size: { width: 16, height: 16 },
			props: { geometry: "ellipse" },
		};
	return {
		...dots,
		heading: {
			type: "text",
			position: { x: 0, y: -80 },
			props: { text: "Motion playground", fontSize: 32 },
		},
		counter: {
			type: "custom",
			position: { x: 0, y: 0 },
			size: { width: 280, height: 64 },
			script: script("counter.js"),
		},
		slider: {
			type: "custom",
			position: { x: 340, y: 0 },
			size: { width: 320, height: 64 },
			script: script("slider.js"),
		},
		broken: {
			type: "custom",
			position: { x: 720, y: 0 },
			size: { width: 200, height: 64 },
			script: script("broken.js"),
		},
		card: {
			type: "shape",
			position: { x: 0, y: 140 },
			size: { width: 240, height: 140 },
			props: { geometry: "rounded", text: "Card" },
			style: { fill: "blue", fillOpacity: 0.16 },
		},
		badge: {
			type: "shape",
			position: { x: 320, y: 160 },
			size: { width: 120, height: 120 },
			props: { geometry: "ellipse", text: "Badge" },
			style: { fill: "amber", fillOpacity: 0.2 },
		},
	};
}

export function motionAnimations(stress = 0): Record<string, unknown> {
	const tracks: Record<string, unknown> = {};
	for (let index = 0; index < stress; index += 1)
		tracks[`dot-${index}-opacity`] = {
			target: `dot-${index}`,
			property: "opacity",
			keyframes: Array.from({ length: 20 }, (_, step) => ({
				at: step * 100,
				value: (step + index) % 2,
			})),
		};
	return {
		intro: {
			name: "Intro",
			duration: 2000,
			markers: [{ at: 1000, label: "Badge", pause: true }],
			tracks: {
				...tracks,
				"card-position": {
					target: "card",
					property: "position",
					keyframes: [
						{ at: 0, value: { x: 0, y: 220 } },
						{ at: 800, value: { x: 0, y: 140 }, ease: "ease-out" },
					],
				},
				"card-opacity": {
					target: "card",
					property: "opacity",
					keyframes: [
						{ at: 0, value: 0 },
						{ at: 600, value: 1 },
					],
				},
				"badge-rotation": {
					target: "badge",
					property: "rotation",
					keyframes: [
						{ at: 1000, value: -20 },
						{ at: 2000, value: 0, ease: "ease-in-out" },
					],
				},
			},
		},
	};
}
