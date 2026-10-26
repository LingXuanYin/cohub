import assert from "node:assert/strict";
import test from "node:test";
import { groupPublishedModApps } from "./space-mods.js";

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
