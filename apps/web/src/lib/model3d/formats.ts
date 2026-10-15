import { normalizeMime } from "@cohub/protocol/fs";

export type ModelFormat = "glb" | "gltf" | "stl" | "obj";

const FORMAT_BY_EXTENSION: Readonly<Record<string, ModelFormat>> = {
	".glb": "glb",
	".gltf": "gltf",
	".stl": "stl",
	".obj": "obj",
};

const FORMAT_BY_MIME: Readonly<Record<string, ModelFormat>> = {
	"model/gltf-binary": "glb",
	"model/gltf+json": "gltf",
	"model/stl": "stl",
	"model/obj": "obj",
};

export function modelFormatOf(
	path: string,
	mimeType: string | null | undefined,
): ModelFormat | null {
	const dot = path.lastIndexOf(".");
	const byName =
		dot > path.lastIndexOf("/") + 1
			? FORMAT_BY_EXTENSION[path.slice(dot).toLowerCase()]
			: undefined;
	return byName ?? FORMAT_BY_MIME[normalizeMime(mimeType) ?? ""] ?? null;
}
