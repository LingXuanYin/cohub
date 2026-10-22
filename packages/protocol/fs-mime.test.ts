import assert from "node:assert/strict";
import { test } from "node:test";
import { isModelMime, isTextMime, mimeTypeForPath, modelFormatForPath } from "./src/fs/index.js";

test("recognizes model MIME without accepting prototype properties as filenames", () => {
  assert.equal(mimeTypeForPath("assets/Robot.GLB"), "model/gltf-binary");
  assert.equal(isModelMime(mimeTypeForPath("part.obj")), true);
  assert.equal(isTextMime(mimeTypeForPath("part.obj")), false);
  for (const name of ["constructor", "__proto__", "hasOwnProperty", "toString"]) {
    assert.equal(mimeTypeForPath(name), null);
  }
});

test("names ABC score files as text, by extension and in any letter case", () => {
  assert.equal(mimeTypeForPath("scores/song.abc"), "text/vnd.abc");
  assert.equal(mimeTypeForPath("SONG.ABC"), "text/vnd.abc");
  assert.equal(isTextMime("text/vnd.abc"), true);
  assert.equal(mimeTypeForPath("scores/song.abcd"), null);
});

test("detects previewable model formats by name, then MIME type", () => {
  assert.equal(modelFormatForPath("assets/Robot.GLB"), "glb");
  assert.equal(modelFormatForPath("scan", "model/stl; charset=binary"), "stl");
  assert.equal(modelFormatForPath("part.3mf", "model/3mf"), null);
  assert.equal(modelFormatForPath("constructor"), null);
});
