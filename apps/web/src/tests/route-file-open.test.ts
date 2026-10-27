import assert from "node:assert/strict";
import { test } from "node:test";
import { applyRouteFileOpen } from "../lib/features/space/modules/route-file-open.ts";

const file = { kind: "file" as const, key: "scores/song.abc" };

test("a file route without a tab opens the default App window", async () => {
	const resolved: string[] = [];
	const opened: unknown[] = [];
	let applied = false;
	const result = await applyRouteFileOpen({
		ref: file,
		hasTab: () => false,
		resolveDefault: async (path) => {
			resolved.push(path);
			return { appId: "app-editor", label: "Editor" };
		},
		openApp: (app) => {
			opened.push(app);
		},
		applyRoute: () => {
			applied = true;
			return { ok: true };
		},
	});
	assert.deepEqual(resolved, ["scores/song.abc"]);
	assert.deepEqual(opened, [{ appId: "app-editor", label: "Editor" }]);
	assert.equal(applied, false, "the built-in file tab is not opened");
	assert.equal(result, "app");
});

test("an already open file tab is activated, not resolved again", async () => {
	let resolved = false;
	let applied: unknown = null;
	const result = await applyRouteFileOpen({
		ref: file,
		hasTab: () => true,
		resolveDefault: async () => {
			resolved = true;
			return { appId: "app-editor" };
		},
		openApp: () => {},
		applyRoute: (ref) => {
			applied = ref;
			return { ok: true };
		},
	});
	assert.equal(resolved, false);
	assert.deepEqual(applied, file);
	assert.equal(result, "route");
});

test("no default App falls back to the built-in file route", async () => {
	let applied: unknown = null;
	const result = await applyRouteFileOpen({
		ref: file,
		hasTab: () => false,
		resolveDefault: async () => null,
		openApp: () => {},
		applyRoute: (ref) => {
			applied = ref;
			return { ok: true };
		},
	});
	assert.deepEqual(applied, file);
	assert.equal(result, "route");
});

test("a port route still waits for its endpoint", async () => {
	const result = await applyRouteFileOpen({
		ref: { kind: "port", key: "3000" },
		hasTab: () => false,
		resolveDefault: async () => null,
		openApp: () => {},
		applyRoute: () => ({ ok: false }),
	});
	assert.equal(result, "pending");
});
