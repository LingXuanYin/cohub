import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";

test("isolated native SDK audio/video/DataChannel loopback exits cleanly", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", new URL("./loopback-worker.mjs", import.meta.url).pathname], { timeout: 15000 });
  assert.match(stdout, /loopback passed/);
});
