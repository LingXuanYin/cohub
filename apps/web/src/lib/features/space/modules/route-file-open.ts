import type { WindowRef } from "./window-route";

export type RouteFileOpenApp = { appId: string; label?: string };

/**
 * A file route goes through the same default-App resolver as a click, unless
 * that file already has a built-in tab; then the tab is activated as before.
 */
export async function applyRouteFileOpen(input: {
	ref: WindowRef | null;
	hasTab: (ref: WindowRef) => boolean;
	resolveDefault: (path: string) => Promise<RouteFileOpenApp | null>;
	openApp: (app: RouteFileOpenApp) => Promise<void> | void;
	applyRoute: (ref: WindowRef | null) => { ok: boolean };
}): Promise<"app" | "route" | "pending"> {
	if (input.ref?.kind === "file" && !input.hasTab(input.ref)) {
		const app = await input.resolveDefault(input.ref.key);
		if (app) {
			await input.openApp(app);
			return "app";
		}
	}
	return input.applyRoute(input.ref).ok ? "route" : "pending";
}
