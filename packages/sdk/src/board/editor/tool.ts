export type BoardToolId =
	| "select"
	| "hand"
	| "text"
	| "shape"
	| "draw"
	| "arrow"
	| "frame";

export function defaultBoardTool(isMobile: boolean): BoardToolId {
	return isMobile ? "hand" : "select";
}

export function isContinuousBoardTool(tool: BoardToolId): boolean {
	return tool === "draw";
}

export function isCreationBoardTool(tool: BoardToolId): boolean {
	return (
		tool === "text" ||
		tool === "shape" ||
		tool === "draw" ||
		tool === "arrow" ||
		tool === "frame"
	);
}
