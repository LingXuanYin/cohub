import type { AppBoardAsset } from "@neta-art/cohub";
import type { BoardAssetSource } from "@neta-art/cohub/board";
import { sdk } from "$lib/sdk";

export type { BoardAssetSource } from "@neta-art/cohub/board";

export function createSpaceBoardAssetSource(spaceId: string): BoardAssetSource {
	return sdk.space(spaceId).boards.assetSource();
}

export function createAppBoardAssetSource(input: {
	manifestUrl: string;
	assets: AppBoardAsset[];
}): BoardAssetSource {
	const base = new URL(".", input.manifestUrl);
	const byPath = new Map(
		input.assets
			.filter((asset) => asset.status === "captured" && asset.artifactPath)
			.map((asset) => [asset.sourcePath, asset.artifactPath as string]),
	);
	const resolveArtifactUrl = async (path: string) => {
		const artifactPath = byPath.get(path);
		return artifactPath ? new URL(artifactPath, base).toString() : null;
	};
	return {
		resolveFileUrl: resolveArtifactUrl,
		resolvePlaybackUrl: resolveArtifactUrl,
	};
}
