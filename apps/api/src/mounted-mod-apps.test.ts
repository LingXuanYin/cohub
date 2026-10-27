import assert from "node:assert/strict";
import test from "node:test";
import {
	groupPublishedModApps,
	visibleMountedModApps,
} from "./mounted-mod-apps.js";

test("published Apps are grouped by their mod Space, in mount order", () => {
	const mods = [{ modSpaceId: "mod-a" }, { modSpaceId: "mod-b" }];
	const rows = [
		{ id: "b-app", spaceId: "mod-b" },
		{ id: "a-app-2", spaceId: "mod-a" },
		{ id: "a-app-1", spaceId: "mod-a" },
	];
	assert.deepEqual(
		groupPublishedModApps(mods, rows).map(({ mod, apps }) => [
			mod.modSpaceId,
			apps.map((app) => app.id),
		]),
		[
			["mod-a", ["a-app-2", "a-app-1"]],
			["mod-b", ["b-app"]],
		],
	);
});

test("only visible, published Apps keep a mod, and a mod with none is dropped", async () => {
	const mods = [
		{ modSpaceId: "mod-a", mountSlug: "a" },
		{ modSpaceId: "mod-b", mountSlug: "b" },
		{ modSpaceId: "mod-c", mountSlug: "c" },
	];
	const rows = [
		{ id: "public", spaceId: "mod-a", status: "published", visibility: "public" },
		{ id: "space", spaceId: "mod-a", status: "published", visibility: "space" },
		{ id: "disabled", spaceId: "mod-a", status: "disabled", visibility: "public" },
		{ id: "hidden", spaceId: "mod-c", status: "published", visibility: "space" },
	];
	const checked: string[] = [];
	const visible = await visibleMountedModApps({
		mods,
		rows,
		canViewModSpace: async (spaceId) => {
			checked.push(spaceId);
			return true;
		},
	});
	assert.deepEqual(
		visible.map(({ mod, apps }) => [mod.modSpaceId, apps.map((app) => app.id)]),
		[
			["mod-a", ["public", "space"]],
			["mod-c", ["hidden"]],
		],
		"mod-b has no Apps, and the disabled App is not published",
	);
	assert.deepEqual(checked, ["mod-a", "mod-c"], "only mods with a space App are checked");
});

test("a space App the viewer cannot see leaves the public Apps", async () => {
	const visible = await visibleMountedModApps({
		mods: [{ modSpaceId: "mod-a" }],
		rows: [
			{ id: "public", spaceId: "mod-a", status: "published", visibility: "public" },
			{ id: "hidden", spaceId: "mod-a", status: "published", visibility: "space" },
		],
		canViewModSpace: async () => false,
	});
	assert.deepEqual(visible[0]?.apps.map((app) => app.id), ["public"]);
});
