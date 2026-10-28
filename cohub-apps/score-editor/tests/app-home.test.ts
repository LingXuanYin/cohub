import assert from "node:assert/strict";
import { test } from "node:test";
import { handoffInstruction, type MountOptions } from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { createApp, type AppHost } from "../src/app/app.ts";
import type { TaskRunSnapshot } from "../src/host/task.ts";
import { createFakeClient } from "./fake-client.ts";
import { FakeElement } from "./helpers.ts";

const SCORE = `X:1
T:
M:4/4
L:1/16
Q:1/4=100
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
% verse
V: Vocal
C16|D16|
`;

function all(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap((child) => all(child))];
}

async function waitFor<T>(read: () => T | null): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for the App home");
}

function installDocument(): { restore(): void; doc: { title: string } } {
  const previous = globalThis.document;
  const doc = {
    documentElement: { lang: "" },
    title: "",
    activeElement: null,
    createElement: () => new FakeElement(),
  } as unknown as Document;
  globalThis.document = doc;
  return {
    doc: doc as unknown as { title: string },
    restore() {
      if (previous === undefined) delete (globalThis as { document?: Document }).document;
      else globalThis.document = previous;
    },
  };
}

function hostFor(
  client: ReturnType<typeof createFakeClient>,
  doc: { title: string },
  taskRunId: string | null = null,
): AppHost {
  return {
    client,
    initial: {
      locale: "en",
      appearance: { colorScheme: "light", tokens: {} },
      spaceId: "space-1",
      file: null,
      taskRunId,
    },
    onLaunch() {
      return () => {};
    },
    onContext() {
      return () => {};
    },
    setTitle(title) {
      doc.title = title;
    },
    setDirty() {},
    onBeforeClose() {},
    close() {},
  };
}

test("the App's first home load never shows the refresh-failed line", async () => {
  const dom = installDocument();
  const client = createFakeClient({ files: { "scores/intro.abc": SCORE } });
  const root = new FakeElement();
  const app = createApp({ root: root as unknown as HTMLElement, host: hostFor(client, dom.doc) });
  try {
    await waitFor(() =>
      all(root).some(
        (node) => node.className === "home-row-title-text" && node.textContent === "intro.abc",
      )
        ? true
        : null,
    );
    const line = all(root).find((node) => node.className === "home-refresh");
    assert.ok(line);
    assert.equal(line.hidden, true);
    assert.notEqual(dom.doc.title, "");
  } finally {
    app.destroy();
    dom.restore();
  }
});

const INSTRUMENTAL = "[Instrumental]";

function task(lyrics: string | null): TaskRunSnapshot {
  return {
    id: "task-1",
    spaceId: "space-1",
    status: "completed",
    payload: {
      data: {
        model: "song2",
        content: [
          { type: "text", text: "warm synthwave", meta: { role: "prompt" } },
          ...(lyrics === null ? [] : [{ type: "text", text: lyrics, meta: { role: "lyrics" } }]),
        ],
        parameters: {},
      },
    },
    result: { output: [{ type: "text", text: SCORE, meta: { role: "abc" } }] },
  };
}

test("an instrumental generated score can be handed off", async () => {
  const dom = installDocument();
  const client = createFakeClient({ tasks: { "task-1": task(INSTRUMENTAL) } });
  const root = new FakeElement();
  const mounts: MountOptions[] = [];
  const fakeMount = (_element: HTMLElement, options: MountOptions) => {
    mounts.push(options);
    return {
      destroy() {},
      hasUnsavedChanges() {
        return false;
      },
      async save() {
        return "unchanged" as const;
      },
      update() {},
    };
  };
  const app = createApp({
    root: root as unknown as HTMLElement,
    host: hostFor(client, dom.doc, "task-1"),
    mount: fakeMount,
  });
  try {
    await waitFor(() => (mounts.length > 0 ? true : null));
    const mounted = mounts[0];
    assert.ok(mounted);
    assert.deepEqual(mounted.requiredInputs, ["style"]);

    const project = {
      style: "warm synthwave",
      lyrics: INSTRUMENTAL,
      score: SCORE,
      scoreMode: "full" as const,
      seed: null,
      modelId: "song2",
      sourceKey: "task-1",
    };
    const instruction = handoffInstruction({
      original: project,
      current: project,
      title: "Night walk",
      language: "en",
      dialect: song2Dialect,
      scorePath: ".cohub/score-drafts/task-1.abc",
    });
    mounted.onHandoff?.({
      attachment: { name: "score.abc", mediaType: "text/plain", text: SCORE },
      instruction,
      project,
    });
    await waitFor(() => (client.chips.length > 0 ? true : null));
    const content = client.chips[0]?.content ?? "";
    assert.match(content, /\[Instrumental\]/);
    assert.doesNotMatch(content, /carries no lyrics/);
  } finally {
    app.destroy();
    dom.restore();
  }
});

test("a generated score without a lyrics block still requires lyrics", async () => {
  const dom = installDocument();
  const client = createFakeClient({ tasks: { "task-1": task(null) } });
  const root = new FakeElement();
  const mounts: MountOptions[] = [];
  const app = createApp({
    root: root as unknown as HTMLElement,
    host: hostFor(client, dom.doc, "task-1"),
    mount: (_element, options) => {
      mounts.push(options);
      return {
        destroy() {},
        hasUnsavedChanges() {
          return false;
        },
        async save() {
          return "unchanged" as const;
        },
        update() {},
      };
    },
  });
  try {
    await waitFor(() => (mounts.length > 0 ? true : null));
    assert.deepEqual(mounts[0]?.requiredInputs, ["style", "lyrics"]);
  } finally {
    app.destroy();
    dom.restore();
  }
});

test("a generated score with an empty lyrics block still requires lyrics", async () => {
  const dom = installDocument();
  const client = createFakeClient({ tasks: { "task-1": task("") } });
  const root = new FakeElement();
  const mounts: MountOptions[] = [];
  const app = createApp({
    root: root as unknown as HTMLElement,
    host: hostFor(client, dom.doc, "task-1"),
    mount: (_element, options) => {
      mounts.push(options);
      return {
        destroy() {},
        hasUnsavedChanges() {
          return false;
        },
        async save() {
          return "unchanged" as const;
        },
        update() {},
      };
    },
  });
  try {
    await waitFor(() => (mounts.length > 0 ? true : null));
    assert.deepEqual(mounts[0]?.requiredInputs, ["style", "lyrics"]);
  } finally {
    app.destroy();
    dom.restore();
  }
});
