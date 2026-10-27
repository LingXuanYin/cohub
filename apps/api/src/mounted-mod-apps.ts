/** Groups published Apps under the mounted mod that owns them, keeping mount order. */
export function groupPublishedModApps<
	TMod extends { modSpaceId: string },
	TApp extends { spaceId: string },
>(mods: TMod[], rows: TApp[]): Array<{ mod: TMod; apps: TApp[] }> {
	const byModSpace = new Map<string, TApp[]>();
	for (const row of rows) {
		const apps = byModSpace.get(row.spaceId);
		if (apps) apps.push(row);
		else byModSpace.set(row.spaceId, [row]);
	}
	return mods.map((mod) => ({ mod, apps: byModSpace.get(mod.modSpaceId) ?? [] }));
}

/**
 * The Apps of mounted mods a viewer can open: published, and a `space` App
 * only when the viewer can view that mod's Space. Mods with nothing visible
 * are dropped, and the mod-space check runs only when such an App exists.
 */
export async function visibleMountedModApps<
	TMod extends { modSpaceId: string },
	TApp extends { spaceId: string; status: string; visibility: string },
>(input: {
	mods: TMod[];
	rows: TApp[];
	canViewModSpace: (modSpaceId: string) => Promise<boolean>;
}): Promise<Array<{ mod: TMod; apps: TApp[] }>> {
	const result: Array<{ mod: TMod; apps: TApp[] }> = [];
	for (const { mod, apps } of groupPublishedModApps(input.mods, input.rows)) {
		const published = apps.filter((app) => app.status === "published");
		if (published.length === 0) continue;
		const hasSpaceApp = published.some((app) => app.visibility === "space");
		const canViewSpaceApps = hasSpaceApp
			? await input.canViewModSpace(mod.modSpaceId)
			: false;
		const visible = published.filter(
			(app) => app.visibility !== "space" || canViewSpaceApps,
		);
		if (visible.length > 0) result.push({ mod, apps: visible });
	}
	return result;
}
