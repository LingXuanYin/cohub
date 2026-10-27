import type { SpaceInstalledApps } from "@cohub/protocol";
import type { SpaceModApps } from "@neta-art/cohub";

export type AppInstallationReaders = {
	readInstalled: (spaceId: string) => Promise<{ document: SpaceInstalledApps }>;
	readMountedModApps: (
		spaceId: string,
		options?: { refresh?: boolean },
	) => Promise<SpaceModApps[]>;
};

/**
 * Whether an App counts as installed in a Space: enabled in its installed Apps,
 * or provided by a mod mounted there. The mounted-mod list is read fresh, so an
 * unmount or unpublished App stops counting at once.
 */
export function createAppInstallationCheck(
	appId: string,
	readers: AppInstallationReaders,
): (spaceId: string) => Promise<boolean> {
	return async (spaceId) => {
		const { document } = await readers.readInstalled(spaceId);
		if (document.apps.some((app) => app.id === appId && app.enabled))
			return true;
		try {
			const mods = await readers.readMountedModApps(spaceId, {
				refresh: true,
			});
			return mods.some((mod) =>
				mod.apps.some((app) => app.id === appId && app.status === "published"),
			);
		} catch {
			return false;
		}
	};
}
