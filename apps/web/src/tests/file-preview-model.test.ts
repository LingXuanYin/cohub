import assert from "node:assert/strict";
import { test } from "node:test";
import { isTextMime, mimeTypeForPath } from "@cohub/protocol";
import type { SpaceFsFileResponse } from "@neta-art/cohub";
import { filePreviewModel, isScorePath } from "../lib/file-preview-model";
import { defaultFileViewMode } from "../lib/resource-kit/diff";
import { previewsBeforeScores } from "./fixtures/file-previews-before-scores";

function fileResponse(
	path: string,
	mimeType: string | null,
	kind: SpaceFsFileResponse["kind"],
): SpaceFsFileResponse {
	return {
		path,
		name: path.split("/").pop() ?? path,
		size: 12,
		mimeType,
		mtimeMs: 1,
		kind,
		encoding: kind === "text" ? "utf-8" : "base64",
		content: kind === "text" ? "x" : "eA==",
		delivery: "inline",
	};
}

/** The response the API builds for a file: the MIME type from its name, and text or binary from that. */
function serverResponse(path: string): SpaceFsFileResponse {
	const mimeType = mimeTypeForPath(path);
	return fileResponse(path, mimeType, isTextMime(mimeType) ? "text" : "binary");
}

test("an .abc file opens in the score preview, which has a Source and a Preview", () => {
	const model = filePreviewModel(serverResponse("scores/song.abc"));
	assert.equal(model.kind, "score");
	assert.equal(model.isText, true);
	assert.equal(model.hasRenderedPreview, true);
	// The file panel opens on this view: the Preview when there is one, otherwise the Source.
	assert.equal(defaultFileViewMode(model.hasRenderedPreview), "preview");
	assert.equal(model.language, "abc");
	assert.equal(model.mediaUrl, null);
});

test("the extension is read the way the server reads it: case does not matter", () => {
	for (const path of ["song.abc", "SONG.ABC", "a/b/Tune.Abc"]) {
		assert.equal(filePreviewModel(serverResponse(path)).kind, "score", path);
	}
});

test("a score too large to arrive inline still opens as a score, to be fetched from its URL", () => {
	const file: SpaceFsFileResponse = {
		...fileResponse("big.abc", "text/vnd.abc", "text"),
		content: "",
		delivery: "url",
		url: "https://files.example/big.abc",
	};
	assert.equal(filePreviewModel(file).kind, "score");
});

// The Open with dialog asks by path alone; the names that look like scores are covered by the recorded rows below.
test("a path is a score only by its .abc extension", () => {
	assert.equal(isScorePath("scores/song.abc"), true);
	assert.equal(isScorePath("abc.md"), false);
	assert.equal(isScorePath(""), false);
});

test("every other file keeps the preview type it had before", () => {
	for (const row of previewsBeforeScores) {
		const model = filePreviewModel(
			fileResponse(row.path, row.mimeType, row.kind),
		);
		assert.deepEqual(
			{
				preview: model.kind,
				isText: model.isText,
				hasRenderedPreview: model.hasRenderedPreview,
				language: model.language,
				hasMediaUrl: model.mediaUrl !== null,
			},
			{
				preview: row.preview,
				isText: row.isText,
				hasRenderedPreview: row.hasRenderedPreview,
				language: row.language,
				hasMediaUrl: row.hasMediaUrl,
			},
			row.path,
		);
	}
});

test("the recorded files are the ones the server still answers for in the same way", () => {
	for (const row of previewsBeforeScores) {
		const response = serverResponse(row.path);
		assert.equal(response.mimeType, row.mimeType, row.path);
		assert.equal(response.kind, row.kind, row.path);
	}
});
