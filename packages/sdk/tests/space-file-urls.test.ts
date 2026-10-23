import assert from "node:assert/strict";
import { test } from "node:test";
import { createSpaceFileReads } from "../src/apis/space-file-reads.js";
import { createSpaceFileUrls } from "../src/apis/space-file-urls.js";
import type { HttpTransport } from "../src/transport.js";
import type { SpaceFsFileResponse } from "../src/types.js";

const file = (path: string, url = `https://cdn.test/${path}`): SpaceFsFileResponse => ({
	path,
	name: path,
	size: 1,
	mimeType: "image/png",
	mtimeMs: 1,
	kind: "binary",
	encoding: "base64",
	content: "",
	delivery: "url",
	url,
});

function setup(urlOf: (path: string) => string = (path) => `https://cdn.test/${path}`) {
	const singles: string[] = [];
	const batches: string[][] = [];
	const transport = {
		async requestRevalidated(url: string) {
			const path = new URL(url, "http://x").searchParams.get("path") as string;
			singles.push(path);
			return file(path, urlOf(path));
		},
		async request(_url: string, init: { body: string }) {
			const { paths } = JSON.parse(init.body) as { paths: string[] };
			batches.push(paths);
			return { files: paths.map((path) => file(path, urlOf(path))), errors: [] };
		},
	} as unknown as HttpTransport;
	const reads = createSpaceFileReads(transport);
	const urls = createSpaceFileUrls({ reads, scope: async () => "user:u", watched: () => true, cache: true });
	return { reads, urls, singles, batches };
}

test("a lone read keeps its plain request, reads of one task share batches", async () => {
	const { reads, singles, batches } = setup();
	await reads.read("s", "a.png");
	const paths = Array.from({ length: 40 }, (_, index) => `${index}.png`);
	await Promise.all([...paths, "0.png"].map((path) => reads.read("s", path)));
	assert.deepEqual(singles, ["a.png"]);
	assert.deepEqual(batches.map((batch) => batch.length), [32, 8]);
});

test("file changes drop remembered URLs and tell listeners", async () => {
	let version = 1;
	const { urls, singles } = setup((path) => `https://cdn.test/${path}?v=${version}`);
	const changed: string[] = [];
	urls.subscribe((_spaceId, path) => changed.push(path));
	await urls.resolve("s", "a.png");
	assert.equal(await urls.resolve("s", "a.png"), "https://cdn.test/a.png?v=1");
	version = 2;
	urls.applyFsChange("s", { changes: [{ path: "a.png", kind: "modify" }] });
	assert.equal(await urls.resolve("s", "a.png"), "https://cdn.test/a.png?v=2");
	assert.deepEqual(changed, ["a.png"]);
	assert.deepEqual(singles, ["a.png", "a.png"]);
});
