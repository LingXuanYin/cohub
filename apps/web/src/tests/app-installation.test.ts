import assert from "node:assert/strict";
import { test } from "node:test";
import type { SpaceInstalledApps } from "@cohub/protocol";
import type { AppRecord, SpaceModApps } from "@neta-art/cohub";
import { createAppInstallationCheck } from "../lib/features/app/app-installation.ts";

const APP = "00000000-0000-4000-8000-0000000000a1";
const OTHER_APP = "00000000-0000-4000-8000-0000000000b1";
const MOD = "00000000-0000-4000-8000-0000000000c1";

const installedDocument = (
	...entries: Array<{ id: string; enabled: boolean }>
): SpaceInstalledApps =>
	({
		format: "cohub.space-apps",
		version: 1,
		apps: entries,
	}) as unknown as SpaceInstalledApps;

const mountedMod = (appId: string, status: AppRecord["status"] = "published") =>
	({
		modSpaceId: MOD,
		name: "Editor mod",
		mountSlug: "editor",
		apps: [{ id: appId, slug: "editor", status, meta: null }],
	}) as unknown as SpaceModApps;

const readers = (input: {
	installed?: SpaceInstalledApps;
	mods?: SpaceModApps[];
}) => ({
	readInstalled: async () => ({
		document: input.installed ?? installedDocument(),
	}),
	readMountedModApps: async () => input.mods ?? [],
});

test("a mounted mod's published App counts as installed in the Space", async () => {
	const check = createAppInstallationCheck(
		APP,
		readers({ mods: [mountedMod(APP)] }),
	);
	assert.equal(await check("space-1"), true);
});

test("a mod's App with another id does not count", async () => {
	const check = createAppInstallationCheck(
		OTHER_APP,
		readers({ mods: [mountedMod(APP)] }),
	);
	assert.equal(await check("space-1"), false);
});

test("an unmounted mod stops counting on the next check", async () => {
	let mods = [mountedMod(APP)];
	const check = createAppInstallationCheck(APP, {
		readInstalled: async () => ({ document: installedDocument() }),
		readMountedModApps: async () => mods,
	});

	assert.equal(await check("space-1"), true);
	mods = [];
	assert.equal(await check("space-1"), false);
});

test("a trust check ignores a stale mounted-mod list", async () => {
	let current = [mountedMod(APP)];
	const stale = [mountedMod(APP)];
	const check = createAppInstallationCheck(APP, {
		readInstalled: async () => ({ document: installedDocument() }),
		readMountedModApps: async (_spaceId, options) =>
			options?.refresh ? current : stale,
	});

	current = [];
	assert.equal(await check("space-1"), false);
});

test("a failed mounted mod read counts as not installed", async () => {
	const check = createAppInstallationCheck(APP, {
		readInstalled: async () => ({ document: installedDocument() }),
		readMountedModApps: async () => {
			throw new Error("offline");
		},
	});
	assert.equal(await check("space-1"), false);
});

test("a disabled App of a mounted mod does not count", async () => {
	const check = createAppInstallationCheck(
		APP,
		readers({ mods: [mountedMod(APP, "disabled")] }),
	);
	assert.equal(await check("space-1"), false);
});

test("an enabled installed App still counts", async () => {
	const check = createAppInstallationCheck(
		APP,
		readers({ installed: installedDocument({ id: APP, enabled: true }) }),
	);
	assert.equal(await check("space-1"), true);
});

test("a disabled installed App does not count", async () => {
	const check = createAppInstallationCheck(
		APP,
		readers({ installed: installedDocument({ id: APP, enabled: false }) }),
	);
	assert.equal(await check("space-1"), false);
});
