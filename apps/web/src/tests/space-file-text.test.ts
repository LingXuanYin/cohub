import assert from "node:assert/strict";
import { test } from "node:test";
import type { SpaceFsFileResponse } from "@neta-art/cohub";
import { filePreviewModel } from "../lib/file-preview-model";
import { coerceInlineTextFile } from "../lib/space-file-text";

const SCORE = "X:1\nT:A tune\nK:C\nCDEF|\n";

/** What an API that does not name `.abc` as text sends: no MIME type, the bytes as base64. */
function binaryResponse(path: string, bytes: Uint8Array): SpaceFsFileResponse {
	return {
		path,
		name: path.split("/").pop() ?? path,
		size: bytes.length,
		mimeType: null,
		mtimeMs: 1,
		kind: "binary",
		encoding: "base64",
		content: btoa(String.fromCharCode(...bytes)),
		delivery: "inline",
	};
}

const encode = (text: string) => new TextEncoder().encode(text);

test("a score the API sent as binary is recovered as text, so it still opens as a score", () => {
	const recovered = coerceInlineTextFile(
		binaryResponse("scores/song.abc", encode(SCORE)),
	);
	assert.equal(recovered.kind, "text");
	assert.equal(recovered.content, SCORE);
	assert.equal(filePreviewModel(recovered).kind, "score");
});

test("a score the API already sends as text is left as it is", () => {
	const file: SpaceFsFileResponse = {
		...binaryResponse("scores/song.abc", encode(SCORE)),
		mimeType: "text/vnd.abc",
		kind: "text",
		encoding: "utf-8",
		content: SCORE,
	};
	assert.equal(coerceInlineTextFile(file), file);
});

test("only text bytes with the .abc extension are recovered", () => {
	const notText = binaryResponse("scores/song.abc", Uint8Array.of(0, 1, 2, 3));
	assert.equal(coerceInlineTextFile(notText).kind, "binary");
	const otherName = binaryResponse("scores/song.abcd", encode(SCORE));
	assert.equal(coerceInlineTextFile(otherName).kind, "binary");
});
