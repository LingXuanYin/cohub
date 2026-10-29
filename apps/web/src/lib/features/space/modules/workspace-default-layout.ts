import {
	parseWorkspaceDefaultLayout,
	type WorkspaceDefaultLayout,
	type WorkspaceLayoutPresentation,
} from "@cohub/protocol";

export {
	parseWorkspaceDefaultLayout,
	type WorkspaceDefaultLayout,
	type WorkspaceLayoutPresentation,
};

/** Base (pre-presentation) geometry resolved from a default layout. */
export type ResolvedDefaultLayoutGeometry = {
	leftSidebarCollapsed: boolean;
	rightSidebarCollapsed: boolean;
	filesColumnHidden: boolean;
	presentation: "default" | "focus";
	mainHidden: boolean;
	/** Whether the configured preview should be opened for this fresh entry. */
	openWindow: boolean;
};

/**
 * Resolve a space default layout into concrete base geometry. Pure so the
 * precedence rules (explicit route preview wins, presentation needs a preview)
 * stay testable independent of uiState.
 *
 * @param hasRoutePreview whether the URL already carries an explicit `?preview=`.
 */
export function resolveDefaultLayoutGeometry(
	layout: WorkspaceDefaultLayout,
	hasRoutePreview: boolean,
): ResolvedDefaultLayoutGeometry {
	const hasWindow = Boolean(layout.window) || hasRoutePreview;
	const focus =
		hasWindow &&
		(layout.presentation === "focus" || layout.presentation === "fullscreen");
	return {
		leftSidebarCollapsed: layout.leftSidebar === "collapsed",
		rightSidebarCollapsed: layout.fileTree === "collapsed",
		// Never hide the Files column while a preview (config or explicit URL)
		// needs to render — explicit preview must win over `filesColumn: hidden`.
		filesColumnHidden: layout.filesColumn === "hidden" && !hasWindow,
		presentation: focus ? "focus" : "default",
		mainHidden: focus && layout.presentation === "fullscreen",
		openWindow: Boolean(layout.window),
	};
}
