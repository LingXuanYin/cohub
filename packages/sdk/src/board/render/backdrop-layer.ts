import { Container, Geometry, Mesh, Shader, Sprite, type Texture, TilingSprite, UniformGroup } from "pixi.js";
import { type BoardBackdrop, type BoardBackdropImage, type BoardBackdropPattern, boardPatternLevel } from "./backdrop.js";

export type BoardBackdropView = {
	x: number;
	y: number;
	zoom: number;
	width: number;
	height: number;
	density: number;
};

export type BoardBackdropLayer = {
	readonly container: Container;
	sync(backdrop: BoardBackdrop, view: BoardBackdropView, texture: Texture | null, imageAlpha?: number): void;
	destroy(): void;
};

const VERTEX = `
in vec2 aPosition;
out vec2 vPosition;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
	mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
	gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
	vPosition = aPosition;
}
`;

const FRAGMENT = `
in vec2 vPosition;
out vec4 finalColor;

uniform float uDensity;
uniform vec2 uOrigin;
uniform float uPitch;
uniform float uFade;
uniform float uSize;
uniform float uSquare;
uniform float uLines;
uniform vec4 uInk;

vec2 snap(vec2 center) {
	return mod(uSize, 2.0) == 1.0 ? floor(center) + 0.5 : floor(center + 0.5);
}

float coverage(vec2 p, float pitch) {
	vec2 d = abs(p - snap(uOrigin + floor((p - uOrigin) / pitch + 0.5) * pitch));
	float radius = uSize * 0.5;
	if (uLines > 0.5) return min(d.x, d.y) < radius ? 1.0 : 0.0;
	if (uSquare > 0.5) return max(d.x, d.y) < radius ? 1.0 : 0.0;
	float edge = 0.5 * uDensity;
	return clamp((radius + edge - length(d)) / edge, 0.0, 1.0);
}

void main() {
	vec2 p = vPosition * uDensity;
	float alpha = uInk.a * max(coverage(p, uPitch * 2.0), coverage(p, uPitch) * uFade);
	finalColor = vec4(uInk.rgb * alpha, alpha);
}
`;

function wrap(value: number, period: number) {
	return ((value % period) + period) % period;
}

function createPatternMesh() {
	const positions = new Float32Array(8);
	const geometry = new Geometry({
		attributes: { aPosition: { buffer: positions, format: "float32x2" } },
		indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
	});
	const uniforms = new UniformGroup({
		uDensity: { value: 1, type: "f32" },
		uOrigin: { value: new Float32Array(2), type: "vec2<f32>" },
		uPitch: { value: 1, type: "f32" },
		uFade: { value: 0, type: "f32" },
		uSize: { value: 1, type: "f32" },
		uSquare: { value: 0, type: "f32" },
		uLines: { value: 0, type: "f32" },
		uInk: { value: new Float32Array(4), type: "vec4<f32>" },
	});
	const shader = Shader.from({
		gl: { name: "board-backdrop-pattern", vertex: VERTEX, fragment: FRAGMENT, preferredFragmentPrecision: "highp" },
		resources: { patternUniforms: uniforms },
	});
	const mesh = new Mesh({ geometry, shader, label: "board-backdrop-pattern" });
	let width = 0;
	let height = 0;

	return {
		mesh,
		sync(pattern: BoardBackdropPattern, view: BoardBackdropView) {
			if (view.width !== width || view.height !== height) {
				width = view.width;
				height = view.height;
				positions.set([0, 0, width, 0, width, height, 0, height]);
				geometry.getBuffer("aPosition").update();
			}
			const level = boardPatternLevel(pattern, view.zoom);
			const pitch = level.pitch * view.density;
			const values = uniforms.uniforms;
			values.uDensity = view.density;
			values.uOrigin[0] = wrap(view.x * view.density, pitch * 2);
			values.uOrigin[1] = wrap(view.y * view.density, pitch * 2);
			values.uPitch = pitch;
			values.uFade = level.fade;
			values.uSize = Math.max(1, Math.round(pattern.size * view.density));
			values.uSquare = pattern.shape === "square" ? 1 : 0;
			values.uLines = pattern.kind === "grid" ? 1 : 0;
			values.uInk[0] = ((pattern.color >> 16) & 0xff) / 255;
			values.uInk[1] = ((pattern.color >> 8) & 0xff) / 255;
			values.uInk[2] = (pattern.color & 0xff) / 255;
			values.uInk[3] = pattern.alpha;
		},
		destroy() {
			mesh.destroy();
			geometry.destroy();
			shader.destroy();
		},
	};
}

function placeImage(
	parts: { tiles: TilingSprite | null; picture: Sprite | null; container: Container },
	image: BoardBackdropImage,
	texture: Texture,
	view: BoardBackdropView,
	alpha: number,
) {
	if (image.fit === "repeat") {
		if (parts.picture) parts.picture.visible = false;
		parts.tiles ??= parts.container.addChildAt(new TilingSprite({ texture, label: "board-backdrop-tiles" }), 0);
		const tiles = parts.tiles;
		const tileWidth = (image.tile?.width ?? texture.width) * view.zoom;
		const tileHeight = (image.tile?.height ?? texture.height) * view.zoom;
		tiles.texture = texture;
		tiles.visible = true;
		tiles.alpha = alpha;
		tiles.width = view.width;
		tiles.height = view.height;
		tiles.tileScale.set(tileWidth / texture.width, tileHeight / texture.height);
		tiles.tilePosition.set(wrap(view.x, tileWidth), wrap(view.y, tileHeight));
		return;
	}
	if (parts.tiles) parts.tiles.visible = false;
	parts.picture ??= parts.container.addChildAt(new Sprite({ texture, label: "board-backdrop-picture" }), 0);
	const picture = parts.picture;
	const fill = image.fit === "cover" ? Math.max : Math.min;
	const scale = fill(view.width / texture.width, view.height / texture.height);
	picture.texture = texture;
	picture.visible = true;
	picture.alpha = alpha;
	picture.width = texture.width * scale;
	picture.height = texture.height * scale;
	picture.position.set((view.width - picture.width) / 2, (view.height - picture.height) / 2);
}

export function createBoardBackdropLayer(options: { patterns: boolean }): BoardBackdropLayer {
	const container = new Container({ label: "board-backdrop" });
	const parts: { tiles: TilingSprite | null; picture: Sprite | null; container: Container } = { tiles: null, picture: null, container };
	let pattern: ReturnType<typeof createPatternMesh> | null = null;

	return {
		container,
		sync(backdrop, view, texture, imageAlpha = 1) {
			if (backdrop.image && texture) placeImage(parts, backdrop.image, texture, view, backdrop.image.opacity * imageAlpha);
			else {
				if (parts.tiles) parts.tiles.visible = false;
				if (parts.picture) parts.picture.visible = false;
			}
			const shown = options.patterns && backdrop.pattern !== null;
			if (shown && backdrop.pattern) {
				if (!pattern) {
					pattern = createPatternMesh();
					container.addChild(pattern.mesh);
				}
				pattern.sync(backdrop.pattern, view);
			}
			if (pattern) pattern.mesh.visible = shown;
		},
		destroy() {
			pattern?.destroy();
			pattern = null;
			container.destroy({ children: true });
		},
	};
}
