import assert from "node:assert/strict";
import { test } from "node:test";
import { isModelMime, isTextMime, mimeTypeForPath } from "./src/fs/index.js";

test("recognizes model MIME without accepting prototype properties as filenames", () => {
  assert.equal(mimeTypeForPath("assets/Robot.GLB"), "model/gltf-binary");
  assert.equal(isModelMime(mimeTypeForPath("part.obj")), true);
  assert.equal(isTextMime(mimeTypeForPath("part.obj")), false);
  for (const name of ["constructor", "__proto__", "hasOwnProperty", "toString"]) {
    assert.equal(mimeTypeForPath(name), null);
  }
});
