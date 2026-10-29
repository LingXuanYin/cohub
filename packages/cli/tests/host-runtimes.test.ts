import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { forgetHostRuntime, hostRuntimes, rememberHostRuntime } from "../src/host/runtimes.js";

test("desktop connections are kept per account, and unreadable state is never overwritten", async () => {
  const root = await mkdtemp(join(tmpdir(), "cohub-host-"));
  const path = join(root, "runtimes.json");
  try {
    await rememberHostRuntime({ key: "a", spaceId: "s", root: "/one" }, path);
    await rememberHostRuntime({ key: "b", spaceId: "s", root: "/one" }, path);
    await rememberHostRuntime({ key: "a", spaceId: "s", root: "/two" }, path);
    assert.deepEqual(await hostRuntimes("a", path), [{ key: "a", spaceId: "s", root: "/two" }]);
    await forgetHostRuntime("a", "s", path);
    assert.deepEqual(await hostRuntimes("a", path), []);
    assert.equal((await hostRuntimes("b", path)).length, 1);

    await writeFile(path, "{ not json");
    await assert.rejects(rememberHostRuntime({ key: "a", spaceId: "s", root: "/one" }, path));
    assert.equal(await readFile(path, "utf8"), "{ not json");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
