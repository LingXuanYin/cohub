import assert from "node:assert/strict";
import { test } from "node:test";
import { resourceWorkspaceUrl } from "../lib/features/space/modules/resource-app-route.ts";
import {
	readAppSearch,
	withCurrentWindow,
	withWindowParam,
} from "../lib/features/space/modules/window-route.ts";

const APP_ID = "11111111-1111-4111-8111-111111111111";
const query = (url: string) => new URL(url, "https://cohub.test").searchParams;

test("an App launch search is read back only as a search", () => {
	assert.equal(
		readAppSearch(new URLSearchParams({ appSearch: "?taskRun=run-1" })),
		"?taskRun=run-1",
	);
	for (const value of ["taskRun=run-1", "#taskRun=run-1", "?x".repeat(2000)]) {
		assert.equal(
			readAppSearch(new URLSearchParams({ appSearch: value })),
			null,
			value.slice(0, 20),
		);
	}
});

test("an App launch search survives a main-route rewrite", () => {
	const current = new URLSearchParams({
		window: `app:${APP_ID}`,
		appSearch: "?taskRun=run-1",
		appHash: "#panel",
	});
	const next = query(withCurrentWindow("/spaces/s/sessions/chat", current));
	assert.equal(next.get("appSearch"), "?taskRun=run-1");
	assert.equal(next.get("appHash"), "#panel");
});

test("a window that is not an App drops its launch search", () => {
	const current = new URLSearchParams({
		appSearch: "?taskRun=run-1",
		appHash: "#panel",
	});
	const next = query(
		withWindowParam("/spaces/s/files/a.abc", current, {
			kind: "file",
			key: "a.abc",
		}),
	);
	assert.equal(next.has("appSearch"), false);
	assert.equal(next.has("appHash"), false);
});

test("a resource App route drops a stale launch search", () => {
	const next = query(
		resourceWorkspaceUrl(
			"/spaces/s/tasks/t",
			new URLSearchParams({ appSearch: "?taskRun=run-1" }),
			{ kind: "task", id: "t" },
		),
	);
	assert.equal(next.has("appSearch"), false);
});
