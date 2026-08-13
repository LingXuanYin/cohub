import assert from "node:assert/strict";
import test from "node:test";
import { createEditTool, createWriteTool, type EditOperations, type FileVersion, type WriteOperations } from "../runtime/tools/basic-tools.js";

const CWD = "/workspace";
const PATH = "/workspace/a.ts";
const V1: FileVersion = { size: 5, mtimeMs: 100 };
const V2: FileVersion = { size: 7, mtimeMs: 200 };

class VersionConflictError extends Error {}

function conflictOperations(): EditOperations & {
  reads: number;
  writes: { content: string; expected: FileVersion }[];
  writeFileConditional: NonNullable<EditOperations["writeFileConditional"]>;
} {
  let content = "alpha\nbeta\n";
  let reads = 0;
  const writes: { content: string; expected: FileVersion }[] = [];
  const currentVersion = () => (content === "alpha\nbeta\n" ? V1 : V2);
  return {
    get reads() {
      return reads;
    },
    get writes() {
      return writes;
    },
    async access() {},
    async readFile() {
      reads += 1;
      return Buffer.from(content, "utf8");
    },
    async readFileWithVersion() {
      reads += 1;
      return { content: Buffer.from(content, "utf8"), version: currentVersion() };
    },
    async writeFile(_path, newContent) {
      content = newContent;
    },
    async writeFileConditional(_path, newContent, expected) {
      if (expected.mtimeMs !== currentVersion().mtimeMs) {
        throw new VersionConflictError("file changed since it was opened");
      }
      writes.push({ content: newContent, expected });
      content = newContent;
    },
    isVersionConflict(error) {
      return error instanceof VersionConflictError;
    },
  };
}

test("edit re-applies edits on a version conflict so concurrent edits compose", async () => {
  const ops = conflictOperations();
  // Simulate another session mutating the file between our read and write:
  // the first conditional write carries a stale version, the replay succeeds.
  let conflictDelivered = false;
  const tool = createEditTool(CWD, {
    operations: {
      ...ops,
      async writeFileConditional(_path, newContent, expected) {
        if (!conflictDelivered) {
          conflictDelivered = true;
          // Concurrent writer lands on a disjoint region: alpha → ALPHA.
          await ops.writeFile(_path, "ALPHA\nbeta\n");
          throw new VersionConflictError("file changed since it was opened");
        }
        return ops.writeFileConditional(_path, newContent, expected);
      },
    },
  });

  const result = await tool.execute("call-1", {
    path: PATH,
    edits: [{ oldText: "beta", newText: "GAMMA" }],
  });

  assert.equal(conflictDelivered, true);
  const text = (result.content as { type: string; text: string }[]).find((c) => c.type === "text")?.text;
  assert.match(text ?? "", /Applied 1 edit\(s\)/);
  // Two reads: the initial attempt and the replay after the conflict.
  assert.equal(ops.reads, 2);
  // The concurrent edit (alpha → ALPHA) survived; our edit composed on top.
  assert.equal(ops.writes.at(-1)?.content, "ALPHA\nGAMMA\n");
});

test("edit surfaces a conflict that touches the edited region", async () => {
  const ops = conflictOperations();
  // The concurrent writer edits the exact region we are replacing, so the
  // replay cannot match oldText anymore and the error must reach the caller.
  let conflictDelivered = false;
  const tool = createEditTool(CWD, {
    operations: {
      ...ops,
      async writeFileConditional(_path, _newContent, _expected) {
        if (!conflictDelivered) {
          conflictDelivered = true;
          await ops.writeFile(_path, "alpha\nBETA\n");
          throw new VersionConflictError("file changed since it was opened");
        }
        throw new Error("replay should not have been attempted");
      },
    },
  });

  await assert.rejects(
    tool.execute("call-1", { path: PATH, edits: [{ oldText: "beta", newText: "GAMMA" }] }),
    /oldText must match exactly one region/,
  );
});

test("edit uses the plain path when conditional hooks are absent", async () => {
  let reads = 0;
  let writes = 0;
  const tool = createEditTool(CWD, {
    operations: {
      async access() {},
      async readFile() {
        reads += 1;
        return Buffer.from("alpha\nbeta\n", "utf8");
      },
      async writeFile() {
        writes += 1;
      },
    },
  });

  await tool.execute("call-1", { path: PATH, edits: [{ oldText: "alpha", newText: "ALPHA" }] });
  assert.equal(reads, 1);
  assert.equal(writes, 1);
});

test("write attaches the session file version when available", async () => {
  let conditionalWrites = 0;
  let plainWrites = 0;
  const tool = createWriteTool(CWD, {
    operations: {
      async mkdir() {},
      async writeFile() {
        plainWrites += 1;
      },
      async getFileVersion() {
        return V1;
      },
      async writeFileConditional(_path, _content, expected) {
        conditionalWrites += 1;
        assert.deepEqual(expected, V1);
      },
    },
  });

  await tool.execute("call-1", { path: PATH, content: "hello" });
  assert.equal(conditionalWrites, 1);
  assert.equal(plainWrites, 0);
});

test("write falls back to a plain write when no version is known", async () => {
  let conditionalWrites = 0;
  let plainWrites = 0;
  const tool = createWriteTool(CWD, {
    operations: {
      async mkdir() {},
      async writeFile() {
        plainWrites += 1;
      },
      async getFileVersion() {
        return null;
      },
      async writeFileConditional() {
        conditionalWrites += 1;
      },
    },
  });

  await tool.execute("call-1", { path: PATH, content: "hello" });
  assert.equal(conditionalWrites, 0);
  assert.equal(plainWrites, 1);
});
