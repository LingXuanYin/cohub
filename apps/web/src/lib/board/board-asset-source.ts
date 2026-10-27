import type { BoardAssetSource } from "@neta-art/cohub/board";
import { sdk } from "$lib/sdk";

export type { BoardAssetSource } from "@neta-art/cohub/board";

export function createSpaceBoardAssetSource(spaceId: string): BoardAssetSource {
	return sdk.space(spaceId).boards.assetSource();
}
