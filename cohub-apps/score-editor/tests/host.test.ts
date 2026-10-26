import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDialectRegistry,
  createEditingSession,
  createScoreFileKeeper,
  type EditingSession,
  type ScoreFileKeeper,
} from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { createScoreHost, type OpenResult } from "../src/host/host.ts";
import { createFakeClient, FakeRequestError, type FakeClient } from "./fake-client.ts";

const SAMPLE = `X:1
T:
M:4/4
L:1/16
Q:1/4=190
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:E
% intro
V: Vocal
z12e2e2|b6b4e4f2-|f4g4z4e4|b6b4e2-e2f2-|
V: Ins
Z4|
`;
const EDITED = SAMPLE.replace("z12e2e2", "z12f2e2");
const PATH = "scores/intro.abc";

function editorFor(opened: OpenResult): {
  session: EditingSession;
  keeper: ScoreFileKeeper;
} {
  assert.ok(opened.ok);
  const session = createEditingSession({
    project: opened.project,
    dialects: createDialectRegistry([song2Dialect]),
    language: "en",
  });
  const keeper = createScoreFileKeeper({
    session,
    original: opened.project,
    source: opened.source,
  });
  return { session, keeper };
}

async function openIntro(client: FakeClient) {
  const host = createScoreHost({ client, language: "en" });
  const opened = await host.openFile({ spaceId: "space-1", path: PATH });
  return { host, opened };
}

test("opens the invoked file as a score-file document", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE } });
  const { opened } = await openIntro(client);

  assert.ok(opened.ok);
  assert.deepEqual(client.calls[0], {
    kind: "authorize",
    spaceId: "space-1",
    scopes: ["file.view", "file.edit"],
    reason: "Open and save score files in this Space.",
  });
  assert.deepEqual(client.calls[1], { kind: "read", spaceId: "space-1", path: PATH });
  assert.equal(opened.project.score, SAMPLE);
  assert.equal(opened.project.modelId, "song2");
  assert.equal(opened.project.style, "");
  assert.equal(opened.project.seed, null);
  assert.equal(opened.editable, true);
  assert.equal(opened.source.kind, "scoreFile");
  assert.equal(opened.source.name, "intro.abc");
  const file = client.fileAt(PATH);
  assert.ok(file);
  assert.equal(opened.source.version, `${file.version.mtimeMs}:${file.version.size}`);
});

test("a save writes the edited text to the invoked path with the opened version", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE } });
  const { opened } = await openIntro(client);
  const { session, keeper } = editorFor(opened);
  const before = client.fileAt(PATH);
  assert.ok(before);

  const taken = session.dispatch({ type: "replaceScoreText", text: EDITED });
  assert.equal(taken.ok, true);
  const result = await keeper.save();

  assert.equal(result.ok, true);
  assert.deepEqual(client.writes, [
    { kind: "write", spaceId: "space-1", path: PATH, text: EDITED, expected: before.version },
  ]);
  const after = client.fileAt(PATH);
  assert.ok(after);
  assert.equal(after.text, EDITED);
  assert.equal(keeper.version, `${after.version.mtimeMs}:${after.version.size}`);
});

test("the next save carries the version the first save returned", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE } });
  const { opened } = await openIntro(client);
  const { session, keeper } = editorFor(opened);
  session.dispatch({ type: "replaceScoreText", text: EDITED });
  await keeper.save();
  const first = client.fileAt(PATH);
  assert.ok(first);

  const again = EDITED.replace("z12f2e2", "z12g2e2");
  session.dispatch({ type: "replaceScoreText", text: again });
  const result = await keeper.save();

  assert.equal(result.ok, true);
  assert.equal(client.writes.length, 2);
  assert.deepEqual(client.writes[1]?.expected, first.version);
});

const THEIRS = SAMPLE.replace("z12e2e2", "z12d2e2");

test("a 409 file_conflict leaves the file alone and opens the two ways out", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE } });
  const { opened } = await openIntro(client);
  const { session, keeper } = editorFor(opened);
  session.dispatch({ type: "replaceScoreText", text: EDITED });
  client.failNextWrite(new FakeRequestError(409, "file_conflict"));

  const result = await keeper.save();

  assert.deepEqual(result, { ok: false, reason: "conflict" });
  assert.equal(keeper.status, "conflict");
  assert.equal(client.writes.length, 1);
  assert.equal(client.fileAt(PATH)?.text, SAMPLE);
});

test("Overwrite reads their version and writes ours with it", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE } });
  const { opened } = await openIntro(client);
  const { session, keeper } = editorFor(opened);
  session.dispatch({ type: "replaceScoreText", text: EDITED });
  client.setFile(PATH, THEIRS);
  const theirs = client.fileAt(PATH);
  assert.ok(theirs);
  client.failNextWrite(new FakeRequestError(409, "file_conflict"));
  await keeper.save();

  await keeper.overwrite();

  assert.equal(client.writes.length, 2);
  assert.deepEqual(client.writes[1], {
    kind: "write",
    spaceId: "space-1",
    path: PATH,
    text: EDITED,
    expected: theirs.version,
  });
  assert.equal(client.fileAt(PATH)?.text, EDITED);
  assert.equal(keeper.status, "clean");
});

test("Load the other version opens their text and version without writing", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE } });
  const { opened } = await openIntro(client);
  const { session, keeper } = editorFor(opened);
  session.dispatch({ type: "replaceScoreText", text: EDITED });
  client.setFile(PATH, THEIRS);
  const theirs = client.fileAt(PATH);
  assert.ok(theirs);
  client.failNextWrite(new FakeRequestError(409, "file_conflict"));
  await keeper.save();

  await keeper.loadTheirs();

  assert.equal(session.project.score, THEIRS);
  assert.equal(keeper.version, `${theirs.version.mtimeMs}:${theirs.version.size}`);
  assert.equal(client.writes.length, 1);
  assert.equal(keeper.status, "clean");
});

test("a revoked grant fails the save once, with no retry, and reports no permission", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE } });
  const { host, opened } = await openIntro(client);
  const { session, keeper } = editorFor(opened);
  const seen: string[] = [];
  host.subscribe((state) => seen.push(state.status));
  session.dispatch({ type: "replaceScoreText", text: EDITED });
  client.revoke();

  const result = await keeper.save();

  assert.deepEqual(result, { ok: false, reason: "failed" });
  assert.equal(client.writes.length, 1);
  assert.deepEqual(host.state(), { status: "no-permission", reason: "revoked" });
  assert.deepEqual(seen, ["no-permission"]);
});

test("a cancelled grant opens no file", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE }, authorize: "cancelled" });
  const { opened } = await openIntro(client);
  assert.equal(opened.ok, false);
  assert.deepEqual(opened.state, { status: "no-permission", reason: "missing" });
  assert.equal(client.reads(), 0);
});

test("a missing file reports that it is gone", async () => {
  const client = createFakeClient();
  const { opened } = await openIntro(client);
  assert.equal(opened.ok, false);
  assert.deepEqual(opened.state, { status: "file-gone" });
});

test("a failed read reports a failure, not a permission problem", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE } });
  client.failNextRead(new FakeRequestError(500));
  const { opened } = await openIntro(client);
  assert.equal(opened.ok, false);
  assert.deepEqual(opened.state, { status: "failed" });
});

test("after a rename the next save writes the new path", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE } });
  const { host, opened } = await openIntro(client);
  const { session, keeper } = editorFor(opened);
  const openedVersion = client.fileAt(PATH)?.version;
  assert.ok(openedVersion);
  const moved = "archive/intro.abc";
  client.setFile(moved, SAMPLE, openedVersion);
  session.dispatch({ type: "replaceScoreText", text: EDITED });

  assert.equal(host.relaunch({ spaceId: "space-1", path: moved }), "moved");
  assert.equal(host.name(), "intro.abc");
  assert.equal(host.path(), moved);
  const result = await keeper.save();

  assert.equal(result.ok, true);
  assert.equal(client.writesTo(PATH), 0);
  assert.deepEqual(client.writes[0]?.expected, openedVersion);
  assert.equal(client.fileAt(moved)?.text, EDITED);
  assert.equal(client.fileAt(PATH)?.text, SAMPLE);
});

test("the same file launched again changes nothing", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE } });
  const { host } = await openIntro(client);
  assert.equal(host.relaunch({ spaceId: "space-1", path: PATH }), "same");
  assert.equal(client.writes.length, 0);
});

test("closing is only held back while changes are unsaved", () => {
  const client = createFakeClient();
  const host = createScoreHost({ client, language: "en" });
  assert.equal(host.allowClose(false), true);
  assert.equal(host.allowClose(true), false);
});
