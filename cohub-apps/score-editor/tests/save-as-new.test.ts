import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDialectRegistry,
  createEditingSession,
  createScoreFileKeeper,
  type ScoreFileKeeper,
} from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { createScoreHost, type ScoreHost } from "../src/host/host.ts";
import { editorNotice } from "../src/app/policy.ts";
import { saveAsNewFile } from "../src/app/save-as-new.ts";
import { createFakeClient, type FakeClient } from "./fake-client.ts";

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

function editorFor(keeper: ScoreFileKeeper) {
  return {
    async save() {
      const result = await keeper.save();
      return result.ok ? ("saved" as const) : result.reason;
    },
  };
}

async function openEdited(client: FakeClient): Promise<{
  host: ScoreHost;
  keeper: ScoreFileKeeper;
  session: ReturnType<typeof createEditingSession>;
}> {
  const host = createScoreHost({ client, language: "en" });
  const opened = await host.openFile({ spaceId: "space-1", path: PATH });
  assert.ok(opened.ok);
  const session = createEditingSession({
    project: opened.project,
    dialects: createDialectRegistry([song2Dialect]),
    language: "en",
  });
  const keeper = createScoreFileKeeper({ session, original: opened.project, source: opened.source });
  session.dispatch({ type: "replaceScoreText", text: EDITED });
  return { host, keeper, session };
}

test("Save as a new file drives the editor save and recreates the path", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE } });
  const { host, keeper } = await openEdited(client);
  client.deleteFile(PATH);
  await keeper.save();
  assert.equal(keeper.status, "dirty");

  const answer = await saveAsNewFile(host, editorFor(keeper));

  assert.equal(answer, "saved");
  assert.equal(client.writes.length, 2);
  const last = client.writes[1];
  assert.equal(last?.path, PATH);
  assert.equal(last?.text, EDITED);
  assert.equal(last?.expected, null);
  assert.equal(keeper.unsaved, false);
  assert.equal(keeper.status, "clean");
  assert.equal(editorNotice({ unsaved: keeper.unsaved, editable: true, message: null, language: "en" }), null);
});

test("a file that came back answers conflict and writes nothing", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE } });
  const { host, keeper } = await openEdited(client);
  client.deleteFile(PATH);
  await keeper.save();
  client.setFile(PATH, SAMPLE);
  const writesBefore = client.writes.length;

  const answer = await saveAsNewFile(host, editorFor(keeper));

  assert.equal(answer, "conflict");
  assert.equal(client.writes.length, writesBefore);
  assert.equal(keeper.status, "conflict");
});

test("a failed Save as a new file disarms so the next plain Save sends the version", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE } });
  const { host, keeper } = await openEdited(client);

  const openedVersion = client.fileAt(PATH)?.version;
  assert.ok(openedVersion);
  const answer = await saveAsNewFile(host, { save: async () => "failed" });

  assert.equal(answer, "failed");
  await keeper.save();
  const last = client.writes.at(-1);
  assert.ok(last?.expected);
  assert.deepEqual(last.expected, openedVersion);
});

test("an unchanged Save as a new file disarms too", async () => {
  const client = createFakeClient({ files: { [PATH]: SAMPLE } });
  const { host, keeper } = await openEdited(client);

  const answer = await saveAsNewFile(host, { save: async () => "unchanged" });

  assert.equal(answer, "unchanged");
  await keeper.save();
  assert.ok(client.writes.at(-1)?.expected);
});
