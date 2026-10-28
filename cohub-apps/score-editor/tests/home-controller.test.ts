import assert from "node:assert/strict";
import { test } from "node:test";
import { createHomeController, type HomeOpenTarget } from "../src/app/home-controller.ts";
import type { TaskRunSnapshot } from "../src/host/task.ts";
import { createFakeClient } from "./fake-client.ts";

class FakeElement {
  className = "";
  hidden = false;
  disabled = false;
  textContent = "";
  title = "";
  type = "";
  dateTime = "";
  tabIndex = 0;
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  onclick: (() => void) | null = null;

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...nodes);
  }

  setAttribute(): void {}
  focus(): void {}
  remove(): void {}
}

function all(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap((child) => all(child))];
}

function texts(root: FakeElement, className: string): string[] {
  return all(root)
    .filter((node) => node.className.split(" ").includes(className))
    .map((node) => node.textContent);
}

function button(root: FakeElement, action: string): FakeElement | null {
  return all(root).find((node) => node.dataset.homeAction === action) ?? null;
}

async function waitFor<T>(read: () => T | null): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for the home");
}

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

const TASK: TaskRunSnapshot = {
  id: "task-1",
  spaceId: "space-1",
  status: "completed",
  createdAt: "2026-10-28T09:30:00.000Z",
  payload: {
    data: {
      model: "song2",
      content: [
        { type: "text", text: "warm synthwave", meta: { role: "prompt" } },
        { type: "text", text: "[Verse]\nNeon lights", meta: { role: "lyrics" } },
      ],
      parameters: {},
    },
  },
  result: { output: [{ type: "text", text: SCORE, meta: { role: "abc" } }] },
};

const TASK_2: TaskRunSnapshot = {
  ...TASK,
  id: "task-2",
  spaceId: "space-2",
  createdAt: "2026-10-27T09:30:00.000Z",
};

function harness(options: { readOnly: boolean }) {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => new FakeElement() } as unknown as Document;
  const root = new FakeElement();
  const opened: HomeOpenTarget[] = [];
  const titles: string[] = [];
  const client = createFakeClient({
    tasks: { "task-1": TASK, "task-2": TASK_2 },
    files: { "scores/intro.abc": SCORE, "world/theme.abc": SCORE },
    scopes: options.readOnly
      ? ["file.view", "taskrun.view"]
      : ["file.view", "taskrun.view", "file.edit"],
    pickedSpace: { id: "space-2", name: "My Space" },
  });
  const controller = createHomeController({
    root: root as unknown as HTMLElement,
    client,
    language: "en",
    onOpen: (target) => opened.push(target),
    onTitle: (title) => titles.push(title),
  });
  return {
    root,
    client,
    opened,
    titles,
    controller,
    restore() {
      if (previous === undefined) delete (globalThis as { document?: Document }).document;
      else globalThis.document = previous;
    },
  };
}

test("the home lists songs and files, and a copy opens the song", async () => {
  const { root, opened, controller, restore } = harness({ readOnly: true });
  try {
    await controller.start("space-1");
    await waitFor(() => (texts(root, "home-row-title").length >= 2 ? true : null));
    assert.ok(texts(root, "home-row-title").includes("Neon lights"));
    assert.ok(texts(root, "home-row-title").includes("intro.abc"));
    assert.ok(texts(root, "home-tag").includes("Generated copy"));

    const row = all(root).find((node) => node.className === "home-row-main" && node.children[0]?.textContent === "intro.abc");
    assert.ok(row);
    row.onclick?.();
    await waitFor(() => (opened.length > 0 ? true : null));
    assert.equal(opened[0]?.kind, "generated");
    assert.equal(opened[0]?.taskRunId, "task-1");
  } finally {
    restore();
  }
});

test("a read-only context picks a working Space and copies a song into it", async () => {
  const { root, opened, controller, client, restore } = harness({ readOnly: true });
  try {
    await controller.start("space-1");
    const copyButton = await waitFor(() =>
      all(root).find((node) => node.dataset.action === "copy-row") ?? null,
    );
    copyButton.onclick?.();
    await waitFor(() => (opened.length > 0 ? true : null));
    assert.equal(controller.workingSpace()?.id, "space-2");
    assert.equal(opened[0]?.spaceId, "space-2");
    assert.equal(opened[0]?.kind, "file");
    assert.equal(opened[0]?.path, "scores/Neon lights.abc");
    assert.equal(client.writes[0]?.spaceId, "space-2");
  } finally {
    restore();
  }
});

test("a picked working Space lists itself and New score writes there", async () => {
  const { root, opened, controller, client, restore } = harness({ readOnly: true });
  try {
    await controller.start("space-1");
    const pick = await waitFor(() => button(root, "pick-space"));
    pick.onclick?.();
    await waitFor(() => (texts(root, "home-row-title").includes("Neon lights") ? true : null));
    assert.equal(controller.workingSpace()?.id, "space-2");

    const newScore = await waitFor(() => {
      const candidate = button(root, "new-score");
      return candidate && !candidate.disabled ? candidate : null;
    });
    newScore.onclick?.();
    await waitFor(() => (opened.length > 0 ? true : null));
    assert.equal(opened[0]?.spaceId, "space-2");
    assert.equal(opened[0]?.kind, "file");
    assert.equal(opened[0]?.path, "scores/new-score.abc");
    assert.equal(client.writes[0]?.spaceId, "space-2");
  } finally {
    restore();
  }
});
