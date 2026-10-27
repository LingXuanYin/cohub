import {
	appHandlesFile,
	clearFileHandlerChoice,
	fileExtensionOf,
	InstalledAppSchema,
	parseAppFileHandlers,
	type SpaceInstalledApps,
	setInstalledAppEnabled,
	setInstalledFileHandler,
	spaceFileHandlerChoice,
} from "@cohub/protocol";
import type {
	AppDetailResponse,
	AppMeta,
	AppRecord,
	SpaceModApps,
} from "@neta-art/cohub";
import { appDisplayTitle } from "$lib/app-page-meta";
import type { InstalledAppsFile } from "./app-center";
import { type AppLoader, loadAppPreview } from "./app-open";

/** An App the viewer can open a file with. */
export type FileHandlerApp = {
	appId: string;
	slug: string;
	meta: AppMeta | null;
	/** Set when the App is published by the Space of a mounted mod. */
	mod?: { modSpaceId: string; name: string };
	/** The first mounted mod App in mount order, the one "Always" may make the default. */
	modDefault?: boolean;
	/** Already installed in this Space, so choosing it writes no install record. */
	installed?: boolean;
};

export type HandlerRecord = Pick<AppRecord, "id" | "slug" | "status" | "meta">;

/** Whether a published App declares that it opens this file. */
export function canOpenFileWith(
	app: HandlerRecord | null | undefined,
	path: string,
): boolean {
	return (
		app?.status === "published" &&
		appHandlesFile(parseAppFileHandlers(app.meta?.fileHandlers), path)
	);
}

const toHandlerApp = (
	app: HandlerRecord,
	mod?: FileHandlerApp["mod"],
	modDefault = false,
	installed = false,
): FileHandlerApp => ({
	appId: app.id,
	slug: app.slug,
	meta: app.meta ?? null,
	...(mod ? { mod } : {}),
	...(modDefault ? { modDefault } : {}),
	...(installed ? { installed } : {}),
});

/** Every App of every mounted mod, in mount order, with its mod identity. */
function* mountedModApps(mods: SpaceModApps[]) {
	for (const mounted of mods) {
		const mod = { modSpaceId: mounted.modSpaceId, name: mounted.name };
		for (const app of mounted.apps) yield { app, mod };
	}
}

export type FileHandlerResolver = ReturnType<typeof createFileHandlerResolver>;

/** After this, a cached App is still used, but refreshed in the background. */
const APP_DETAIL_TTL_MS = 5 * 60 * 1_000;

/** The App is gone for this viewer, as opposed to unreachable right now. */
const isGone = (cause: unknown) => {
	const status = (cause as { status?: number } | null)?.status;
	return status === 403 || status === 404;
};

/** Resolves which App opens a file; App lookups are stale-while-revalidate. */
export function createFileHandlerResolver(deps: {
	loader: Pick<AppLoader, "get" | "getPublicById">;
	/** Apps the Space published. */
	listSpaceApps: (spaceId: string) => Promise<HandlerRecord[]>;
	/** The Space's installed Apps, `.cohub/apps.json`. */
	readInstalled: (spaceId: string) => Promise<SpaceInstalledApps>;
	/** Apps published by mounted mods' Spaces, in mount order. */
	listMountedModApps?: (spaceId: string) => Promise<SpaceModApps[]>;
}) {
	const details = new Map<string, { detail: AppDetailResponse; at: number }>();
	const inFlight = new Map<string, Promise<AppDetailResponse | null>>();

	function fetchApp(appId: string) {
		let pending = inFlight.get(appId);
		if (pending) return pending;
		pending = loadAppPreview(deps.loader, appId)
			.then(
				(detail) => {
					details.set(appId, { detail, at: Date.now() });
					return detail;
				},
				(cause) => {
					// A gone App is not cached, so the next open looks again.
					if (!isGone(cause)) throw cause;
					details.delete(appId);
					return null;
				},
			)
			.finally(() => inFlight.delete(appId));
		inFlight.set(appId, pending);
		return pending;
	}

	/** Null when the App is gone; rejects only when unreachable and uncached. */
	function loadApp(appId: string): Promise<AppDetailResponse | null> {
		const cached = details.get(appId);
		if (!cached) return fetchApp(appId);
		// A failed refresh keeps the known App.
		if (Date.now() - cached.at >= APP_DETAIL_TTL_MS)
			void fetchApp(appId).catch(() => {});
		return Promise.resolve(cached.detail);
	}

	/** The default App for this file; `app` is null when it can no longer open it. */
	async function resolveDefault(
		spaceId: string,
		path: string,
	): Promise<{ ref: string; app: FileHandlerApp | null } | null> {
		if (!fileExtensionOf(path)) return null;
		const choice = spaceFileHandlerChoice(
			await deps.readInstalled(spaceId),
			path,
		);
		if (choice?.kind === "builtin") return null;
		if (choice?.kind === "app") {
			const holder = choice.app;
			const detail = await loadApp(holder.id);
			return {
				ref: holder.ref,
				app:
					detail && canOpenFileWith(detail.app, path)
						? toHandlerApp(detail.app)
						: null,
			};
		}
		const mods =
			(await deps.listMountedModApps?.(spaceId).catch(() => [])) ?? [];
		for (const { app, mod } of mountedModApps(mods)) {
			if (!canOpenFileWith(app, path)) continue;
			// One unreachable App must not hide the rest of the mounts.
			const detail = await loadApp(app.id).catch(() => null);
			if (!detail || !canOpenFileWith(detail.app, path)) continue;
			return {
				ref: `${detail.owner.username}/${detail.space.slug}/${detail.app.slug}`,
				app: toHandlerApp(detail.app, mod),
			};
		}
		return null;
	}

	/** Apps this Space published or installed that declare the file's extension. */
	async function listCandidates(spaceId: string, path: string) {
		if (!fileExtensionOf(path)) return [];
		const [own, installed, mods] = await Promise.all([
			deps.listSpaceApps(spaceId).catch(() => []),
			deps.readInstalled(spaceId).then(
				(document) => document.apps.filter((app) => app.enabled),
				() => [],
			),
			deps.listMountedModApps?.(spaceId).catch(() => []) ?? [],
		]);
		const installedApps = await Promise.all(
			installed.map((app) => loadApp(app.id).catch(() => null)),
		);
		const modById = new Map<string, FileHandlerApp["mod"]>();
		for (const { app, mod } of mountedModApps(mods)) {
			if (!modById.has(app.id)) modById.set(app.id, mod);
		}
		const seen = new Set<string>();
		const candidates: FileHandlerApp[] = [];
		for (const app of own) {
			if (seen.has(app.id) || !canOpenFileWith(app, path)) continue;
			seen.add(app.id);
			candidates.push(toHandlerApp(app, modById.get(app.id)));
		}
		for (const detail of installedApps) {
			const app = detail?.app;
			if (!app || seen.has(app.id) || !canOpenFileWith(app, path)) continue;
			seen.add(app.id);
			candidates.push(toHandlerApp(app, modById.get(app.id), false, true));
		}
		let modDefault = true;
		for (const { app, mod } of mountedModApps(mods)) {
			if (seen.has(app.id) || !canOpenFileWith(app, path)) continue;
			seen.add(app.id);
			candidates.push(toHandlerApp(app, mod, modDefault));
			modDefault = false;
		}
		return candidates;
	}

	return {
		resolveDefault,
		listCandidates,
		loadApp,
		clear: () => details.clear(),
	};
}

/** The install record for a Space's own App, so it can become a default. */
export function installedAppFromDetail(detail: AppDetailResponse) {
	if (!detail.publicUrl) throw new Error("This App has no public URL yet.");
	const icon = detail.app.meta?.icon;
	return InstalledAppSchema.parse({
		id: detail.app.id,
		ref: `${detail.owner.username}/${detail.space.slug}/${detail.app.slug}`,
		url: detail.publicUrl,
		enabled: true,
		source: { type: "url", url: detail.publicUrl },
		snapshot: {
			name: appDisplayTitle(detail.app.meta, detail.app.slug),
			...(detail.app.meta?.description
				? { description: detail.app.meta.description }
				: {}),
			...(icon && /^https?:\/\//.test(icon) ? { icon } : {}),
		},
		installedAt: new Date().toISOString(),
	});
}

export type FileHandlerPick =
	| { kind: "builtin" }
	| { kind: "app"; appId: string };

export type FileHandlerOpenPlan = {
	app: FileHandlerApp | null;
	/** What to write to `.cohub/apps.json`, or null to leave it alone. */
	save: "app" | "builtin" | "clear" | null;
};

/**
 * Plans an "Open with" pick. A mounted mod's App is never installed: "Always"
 * on the mount-order default only clears the Space's own choice, and any other
 * mod App opens once.
 */
export function planOpenWith(input: {
	pick: FileHandlerPick;
	always: boolean;
	candidates: FileHandlerApp[] | null;
}): FileHandlerOpenPlan {
	const appId = input.pick.kind === "app" ? input.pick.appId : null;
	const app =
		appId === null
			? null
			: (input.candidates?.find((candidate) => candidate.appId === appId) ??
				null);
	if (!input.always) return { app, save: null };
	if (input.pick.kind !== "app") return { app: null, save: "builtin" };
	if (!app) return { app: null, save: null };
	if (app.mod && !app.installed)
		return { app, save: app.modDefault ? "clear" : null };
	return { app, save: "app" };
}

export type FileHandlerWriteDeps = {
	read: (spaceId: string) => Promise<InstalledAppsFile>;
	write: (
		spaceId: string,
		document: SpaceInstalledApps,
		revision: InstalledAppsFile["revision"],
	) => Promise<InstalledAppsFile["revision"]>;
	loadApp: (appId: string) => Promise<AppDetailResponse | null>;
};

/** Drops the Space's choice for the file's extension so mounts decide again. */
export async function clearDefaultFileHandler(
	deps: Pick<FileHandlerWriteDeps, "read" | "write">,
	input: { spaceId: string; path: string },
): Promise<InstalledAppsFile | null> {
	const extension = fileExtensionOf(input.path);
	if (!extension) return null;
	const current = await deps.read(input.spaceId);
	const next = clearFileHandlerChoice(current.document, extension);
	const revision = await deps.write(input.spaceId, next, current.revision);
	return { document: next, revision };
}

/** Sets the default App for the file's extension (null: built in), conditional on the read revision. */
export async function saveDefaultFileHandler(
	deps: FileHandlerWriteDeps,
	input: { spaceId: string; path: string; appId: string | null },
): Promise<InstalledAppsFile | null> {
	const extension = fileExtensionOf(input.path);
	if (!extension) return null;
	const current = await deps.read(input.spaceId);
	let document = current.document;
	if (input.appId && !document.apps.some((app) => app.id === input.appId)) {
		const detail = await deps.loadApp(input.appId);
		if (!detail) throw new Error("This App is not available.");
		document = {
			...document,
			apps: [...document.apps, installedAppFromDetail(detail)],
		};
	}
	// Choosing an App to open a file type is also choosing to use it.
	if (input.appId)
		document = setInstalledAppEnabled(document, input.appId, true);
	const next = setInstalledFileHandler(document, extension, input.appId);
	const revision = await deps.write(input.spaceId, next, current.revision);
	return { document: next, revision };
}
