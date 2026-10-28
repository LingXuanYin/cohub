import assert from "node:assert/strict";
import { test } from "node:test";
import type { CohubClient } from "@neta-art/cohub";
import { VOICE } from "./mind.ts";
import { Voice } from "./voice.ts";

type Model = {
  model: string;
  hidden?: boolean;
  meta?: { fields?: Record<string, unknown> };
  content?: { input?: Array<{ type?: string }> };
};

// A model that can design a voice (meta.voice_prompt) and clone one (audio input).
const speech = (model: string, extra: Partial<Model> = {}): Model => ({
  model,
  meta: { fields: { voice_prompt: {} } },
  content: { input: [{ type: "text" }, { type: "audio" }] },
  ...extra,
});

type Request = {
  spaceId: string;
  model: string;
  content: Array<{ type: string; text?: string; source?: { type: string; url: string } }>;
  meta?: Record<string, unknown>;
};

function fakeClient(models: Model[] | Error) {
  const requests: Request[] = [];
  let made = 0;
  const client = {
    models: {
      listMultimodal: async () => {
        if (models instanceof Error) throw models;
        return { models };
      },
    },
    generations: {
      createAndWait: async (request: Request) => {
        requests.push(request);
        made += 1;
        return { output: [{ type: "audio", source: { type: "url", url: `https://example.com/line-${made}.mp3` } }] };
      },
    },
  };
  return { client: client as unknown as CohubClient, requests };
}

const line = "A line long enough to be spoken aloud.";

test("prepare picks a model by what it declares, whatever its id", async () => {
  const { client } = fakeClient([{ model: "tts-like-name" }, speech("cue3")]);
  assert.equal(await new Voice(client, "space_1", "en").prepare(), "cue3");
});

test("prepare skips hidden models and models that cannot design or clone", async () => {
  const { client } = fakeClient([
    speech("hidden-one", { hidden: true }),
    speech("no-design", { meta: { fields: {} } }),
    speech("no-meta", { meta: undefined }),
    speech("no-audio", { content: { input: [{ type: "text" }] } }),
    speech("no-input", { content: undefined }),
    speech("good"),
    speech("later"),
  ]);
  assert.equal(await new Voice(client, "space_1", "en").prepare(), "good");
});

test("prepare returns null when no model qualifies or the catalog fails", async () => {
  const none = fakeClient([speech("hidden-one", { hidden: true }), speech("no-audio", { content: { input: [{ type: "text" }] } })]);
  assert.equal(await new Voice(none.client, "space_1", "en").prepare(), null);
  const broken = fakeClient(new Error("catalog down"));
  assert.equal(await new Voice(broken.client, "space_1", "en").prepare(), null);
});

test("the first line designs a voice and later lines clone the first line's audio with the same model", async () => {
  const { client, requests } = fakeClient([speech("cue3")]);
  const voice = new Voice(client, "space_1", "zh");
  await voice.prepare();

  assert.equal(await voice.speak(line), "https://example.com/line-1.mp3");
  assert.equal(await voice.speak(`${line} Again.`), "https://example.com/line-2.mp3");

  const [first, second] = requests;
  assert.equal(first?.model, "cue3");
  assert.deepEqual(first?.meta, { voice_prompt: VOICE.zh });
  assert.deepEqual(
    first?.content.map((block) => block.type),
    ["text"],
  );

  assert.equal(second?.model, "cue3");
  assert.equal(second?.meta, undefined);
  assert.deepEqual(second?.content[1], { type: "audio", source: { type: "url", url: "https://example.com/line-1.mp3" } });
});

test("a line that is too short is not spoken", async () => {
  const { client, requests } = fakeClient([speech("cue3")]);
  const voice = new Voice(client, "space_1", "en");
  await voice.prepare();
  assert.equal(await voice.speak("Too short"), null);
  assert.equal(requests.length, 0);
});
