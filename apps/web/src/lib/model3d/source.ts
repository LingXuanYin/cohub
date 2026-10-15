import type { SpaceFsFileResponse } from "@neta-art/cohub";

type ReadOptions = {
	signal: AbortSignal;
	onProgress?: (fraction: number) => void;
};

function decodeBase64(value: string): Uint8Array {
	const native = (Uint8Array as { fromBase64?: (value: string) => Uint8Array })
		.fromBase64;
	if (native) return native(value);
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

async function fetchBytes(
	url: string,
	expectedSize: number,
	{ signal, onProgress }: ReadOptions,
): Promise<Uint8Array> {
	const response = await fetch(url, { signal });
	if (!response.ok)
		throw new Error(`Model download failed (${response.status})`);
	const total =
		expectedSize > 0
			? expectedSize
			: Number(response.headers.get("content-length")) || 0;
	if (!response.body || !total || !onProgress) {
		return new Uint8Array(await response.arrayBuffer());
	}

	const reader = response.body.getReader();
	let buffer = new Uint8Array(total);
	let loaded = 0;
	let reported = -1;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (loaded + value.byteLength > buffer.byteLength) {
			const grown = new Uint8Array(
				Math.max(buffer.byteLength * 2, loaded + value.byteLength),
			);
			grown.set(buffer.subarray(0, loaded));
			buffer = grown;
		}
		buffer.set(value, loaded);
		loaded += value.byteLength;
		const percent = Math.min(100, Math.floor((loaded / total) * 100));
		if (percent !== reported) {
			reported = percent;
			onProgress(percent / 100);
		}
	}
	return loaded === buffer.byteLength ? buffer : buffer.slice(0, loaded);
}

export function readModelBytes(
	file: SpaceFsFileResponse,
	options: ReadOptions,
): Promise<Uint8Array> {
	if (file.delivery === "url") {
		if (!file.url) return Promise.reject(new Error("Model URL is missing"));
		return fetchBytes(file.url, file.size, options);
	}
	return Promise.resolve(
		file.encoding === "base64"
			? decodeBase64(file.content)
			: new TextEncoder().encode(file.content),
	);
}
