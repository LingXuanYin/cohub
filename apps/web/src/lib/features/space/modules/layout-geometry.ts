export const MAIN_PANEL_MIN_WIDTH = 320;

export const PREVIEW_MIN_WIDTH = 280;

export const MAIN_COLLAPSE_OVERSHOOT = 120;

export function maxMainPanelWidth(layoutWidth: number, treeWidth: number) {
	return Math.max(
		MAIN_PANEL_MIN_WIDTH,
		layoutWidth - treeWidth - PREVIEW_MIN_WIDTH,
	);
}

export function mainCollapseArmed(desiredWidth: number, startWidth: number) {
	return (
		desiredWidth <
		Math.min(startWidth, MAIN_PANEL_MIN_WIDTH) - MAIN_COLLAPSE_OVERSHOOT
	);
}

export type FilesChromeVisibility = {
	isCompact: boolean;
	mobileDrawerOpen: boolean;
	filesColumnHidden: boolean;
	treeCollapsed: boolean;
	hasPreview: boolean;
};

export function filesChromeEffectivelyHidden(
	state: FilesChromeVisibility,
): boolean {
	if (state.isCompact) return !state.mobileDrawerOpen;
	if (state.filesColumnHidden) return true;
	return state.treeCollapsed && !state.hasPreview;
}

export function resolveFilesChromeToggle(
	state: FilesChromeVisibility,
): "toggle-mobile" | "reveal" | "hide" {
	if (state.isCompact) return "toggle-mobile";
	return filesChromeEffectivelyHidden(state) ? "reveal" : "hide";
}
