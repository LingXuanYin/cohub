import assert from "node:assert/strict";
import { mock, test } from "node:test";

process.env.LOG_LEVEL = "silent";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const MOD_A = "22222222-2222-4222-8222-222222222222";
const MOD_B = "33333333-3333-4333-8333-333333333333";
const APP_PUBLIC = "44444444-4444-4444-8444-444444444444";
const APP_SPACE = "55555555-5555-4555-8555-555555555555";
const APP_DISABLED = "66666666-6666-4666-8666-666666666666";

type User = { uuid: string } | null;

let user: User = null;
let canViewMounting = true;
const modSpaceVisibility = new Map<string, boolean>();
const permissionChecks: string[] = [];
let mods: Array<Record<string, unknown>> = [];
let rows: Array<Record<string, unknown>> = [];

const appRow = (fields: Record<string, unknown>) => ({
	id: APP_PUBLIC,
	spaceId: MOD_A,
	userUuid: "user-1",
	slug: "editor",
	status: "published",
	visibility: "public",
	targetType: "directory",
	targetRef: "dist",
	assetKey: null,
	currentVersionId: null,
	latestVersion: 1,
	publishedAt: new Date("2026-08-01T00:00:00.000Z"),
	appScopes: [],
	allowedViewerScopes: [],
	meta: { fileHandlers: [".abc"] },
	createdAt: new Date("2026-07-01T00:00:00.000Z"),
	updatedAt: new Date("2026-08-01T00:00:00.000Z"),
	...fields,
});

mock.module("../src/lib/middleware.js", {
	namedExports: {
		getOptionalAuth: () => user,
		useAuth: () => user ?? { uuid: "user-1" },
		requireValidId: (id: string) => id === SPACE_ID,
		authzDenied: (c: { json: (body: unknown, status: number) => Response }) =>
			c.json({ message: "forbidden" }, 403),
	},
});
mock.module("../src/permissions.js", {
	namedExports: {
		hasPermission: async (
			_user: unknown,
			permission: string,
			context: { spaceId: string },
		) => {
			permissionChecks.push(context.spaceId);
			if (permission !== "space.view") return true;
			if (context.spaceId === SPACE_ID) return canViewMounting;
			return modSpaceVisibility.get(context.spaceId) === true;
		},
	},
});
mock.module("@cohub/core/space-mods", {
	namedExports: {
		listEnabledSpaceMods: async () => mods,
		listSpaceMods: async () => mods,
	},
});
mock.module("@cohub/core/references", {
	namedExports: { deleteReference: async () => undefined },
});
mock.module("../src/space-mods.js", {
	namedExports: {
		createSpaceMod: async () => ({ item: undefined, sandboxRestarting: false }),
		getSpaceModUniqueViolationMessage: () => null,
		normalizeSpaceModName: (value: unknown) =>
			typeof value === "string" ? value : null,
		parseSpaceModMountSlug: (value: string | null | undefined) => ({
			ok: true,
			value: value ?? null,
		}),
		restartSandboxForMods: async () => undefined,
		spaceModErrorResponse: () => null,
	},
});
mock.module("../src/db/index.js", {
	namedExports: {
		db: {
			select: () => ({
				from: () => ({
					where: () => ({
						orderBy: async () => rows,
					}),
				}),
			}),
		},
	},
});

const { default: router } = await import("../src/routes/spaces/mods.route.js");
const { Hono } = await import("hono");
const app = new Hono().route("/spaces/:id/mods", router);
const get = () => app.request(`/spaces/${SPACE_ID}/mods/apps`);

test("a guest sees public Apps, empty mods are dropped, and only a mod with a space App is checked", async () => {
	user = { uuid: "guest-1" };
	canViewMounting = true;
	modSpaceVisibility.clear();
	permissionChecks.length = 0;
	mods = [
		{ modSpaceId: MOD_A, name: null, mountSlug: "base", modSpaceName: "Base" },
		{ modSpaceId: MOD_B, name: "Empty", mountSlug: "empty", modSpaceName: "Empty" },
	];
	rows = [
		appRow({ id: APP_PUBLIC }),
		appRow({ id: APP_SPACE, visibility: "space" }),
		appRow({ id: APP_DISABLED, status: "disabled" }),
	];

	const response = await get();
	assert.equal(response.status, 200);
	const body = (await response.json()) as {
		mods: Array<{ modSpaceId: string; name: string; apps: Array<{ id: string }> }>;
	};
	assert.deepEqual(
		body.mods.map((mod) => [
			mod.modSpaceId,
			mod.name,
			mod.apps.map((item) => item.id),
		]),
		[[MOD_A, "base", [APP_PUBLIC]]],
	);
	assert.deepEqual(permissionChecks, [SPACE_ID, MOD_A]);
});

test("a signed-out viewer follows the same public rule", async () => {
	user = null;
	canViewMounting = true;
	permissionChecks.length = 0;
	mods = [{ modSpaceId: MOD_A, name: "Editor", mountSlug: "editor" }];
	rows = [appRow({ id: APP_PUBLIC })];
	const response = await get();
	assert.equal(response.status, 200);
	const body = (await response.json()) as {
		mods: Array<{ name: string; apps: Array<{ id: string }> }>;
	};
	assert.deepEqual(body.mods.map((mod) => [mod.name, mod.apps.map((item) => item.id)]), [
		["Editor", [APP_PUBLIC]],
	]);
});

test("a member of the mod Space also sees its space-visibility App", async () => {
	user = { uuid: "member-1" };
	canViewMounting = true;
	modSpaceVisibility.set(MOD_A, true);
	permissionChecks.length = 0;
	mods = [{ modSpaceId: MOD_A, name: "Editor", mountSlug: "editor" }];
	rows = [
		appRow({ id: APP_PUBLIC }),
		appRow({ id: APP_SPACE, visibility: "space" }),
	];
	const response = await get();
	assert.equal(response.status, 200);
	const body = (await response.json()) as {
		mods: Array<{ apps: Array<{ id: string }> }>;
	};
	assert.deepEqual(body.mods[0]?.apps.map((item) => item.id), [
		APP_PUBLIC,
		APP_SPACE,
	]);
});

test("a viewer without space.view on the mounting Space is refused", async () => {
	user = null;
	canViewMounting = false;
	const response = await get();
	assert.equal(response.status, 403);
});
