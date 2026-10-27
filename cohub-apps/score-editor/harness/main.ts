import { createApp, type AppHost } from "../src/app/app.ts";
import { frameCopy, languageFor } from "../src/app/copy.ts";
import { stateCopy } from "../src/app/policy.ts";
import { createFrameView } from "../src/app/view.ts";
import "../src/app/styles.css";
import { createFakeClient, FakeRequestError, type FakeClient } from "../tests/fake-client.ts";

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
const THEIRS = SAMPLE.replace("z12e2e2", "z12d2e2");
const SPACE = "space-1";
const LONG_NAME = "morning-walk-in-the-rain-with-a-very-long-name-that-keeps-going-and-going.abc";
const PATHS = {
  default: "scores/intro.abc",
  root: "intro.abc",
  deep: "projects/2026/morning-walk/scores/drafts/intro.abc",
  long: `scores/${LONG_NAME}`,
} as const;

const LIGHT = {
  "bg-primary": "#ffffff",
  "bg-content": "#ffffff",
  "bg-surface": "#f4f4f5",
  "bg-hover": "#ececee",
  "text-primary": "#18181b",
  "text-secondary": "#52525b",
  "text-tertiary": "#71717a",
  "border-subtle": "#e4e4e7",
  "border-primary": "#a1a1aa",
  brand: "#FF3E00",
  "brand-hover": "#E63700",
  "brand-contrast-fg": "#1b1c1f",
  "font-sans": 'system-ui, -apple-system, "Segoe UI", sans-serif',
};
const DARK = {
  "bg-primary": "#1b1c1f",
  "bg-content": "#1b1c1f",
  "bg-surface": "#26262a",
  "bg-hover": "#2f2f34",
  "text-primary": "#ececee",
  "text-secondary": "#b4b4bb",
  "text-tertiary": "#a1a1aa",
  "border-subtle": "#2c2c30",
  "border-primary": "#52525b",
  brand: "#FF3E00",
  "brand-hover": "#FF5520",
  "brand-contrast-fg": "#1b1c1f",
  "font-sans": 'system-ui, -apple-system, "Segoe UI", sans-serif',
};

const BROKEN = "this is not a song2 score";

const params = new URLSearchParams(location.search);
const state = params.get("state") ?? "editable";
const locale = params.get("lang") === "zh" ? "zh-CN" : "en-US";
const colorScheme = params.get("theme") === "light" ? "light" : "dark";
const pathKind = (params.get("path") ?? "default") as keyof typeof PATHS;
const PATH = PATHS[pathKind] ?? PATHS.default;
const tokens = colorScheme === "light" ? LIGHT : DARK;
document.documentElement.lang = locale;
document.documentElement.style.colorScheme = colorScheme;
for (const [token, value] of Object.entries(tokens)) {
  document.documentElement.style.setProperty(`--cohub-${token}`, value);
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("The harness page has no #app element.");
const chipPanel = document.querySelector<HTMLElement>("#chip");

/** Polls for something the App renders asynchronously; the harness has no test framework. */
async function until<T>(read: () => T | null): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The harness gave up waiting for the handoff controls.");
}

/** The dev-only readout of the chip the fake composer received, with how often it was replaced. */
function watchChip(client: FakeClient): void {
  if (!chipPanel) return;
  let seen = -1;
  setInterval(() => {
    const chip = client.chips.at(-1);
    if (chip === undefined) {
      if (client.chips.length !== seen) chipPanel.hidden = true;
      return;
    }
    if (client.chips.length === seen) return;
    seen = client.chips.length;
    const title = document.createElement("div");
    title.className = "chip-title";
    title.textContent = `Fake composer chip · set ${client.chips.length}×`;
    const label = document.createElement("div");
    label.className = "chip-label";
    label.textContent = chip.label;
    const content = document.createElement("pre");
    content.className = "chip-content";
    content.textContent = chip.content;
    chipPanel.replaceChildren(title, label, content);
    chipPanel.hidden = false;
  }, 100);
}

/** Presses the package's handoff trigger and confirms its review, as a person would. */
async function handOff(hostRoot: HTMLElement): Promise<void> {
  const trigger = await until(() =>
    hostRoot.querySelector<HTMLButtonElement>(".sce-handoff-button:not([disabled])"),
  );
  trigger.click();
  const confirm = await until(() =>
    hostRoot.querySelector<HTMLButtonElement>(".sce-handoff-confirm"),
  );
  confirm.click();
}

function boot(): void {
  const hostRoot = root as HTMLElement;
  hostRoot.replaceChildren();
  const language = languageFor(locale);

  if (state === "no-host") {
    const view = createFrameView(hostRoot, language);
    view.setFile(null, null, false);
    view.showState(stateCopy("no-host", null, language));
    return;
  }
  if (state === "startup-failed") {
    const copy = frameCopy(language);
    const view = createFrameView(hostRoot, language);
    view.setFile(null, null, false);
    view.showState({
      title: copy.startupFailedTitle,
      body: copy.startupFailedBody,
      action: { label: copy.retry, run: () => boot() },
    });
    return;
  }

  const readOnly = state === "readonly" || state === "readonly-retry";
  const fileText = state === "handoff-refused" ? BROKEN : SAMPLE;
  const client = createFakeClient({
    files: state === "file-gone" ? {} : { [PATH]: fileText },
    scopes: readOnly ? ["file.view"] : ["file.view", "file.edit"],
    authorize: state.startsWith("no-permission") ? "cancelled" : "granted",
    authorizeSteps:
      state === "no-permission-retry"
        ? ["cancelled", "granted"]
        : state === "no-permission-declined"
          ? ["cancelled", "cancelled"]
          : undefined,
    neverResolveRead: state === "loading",
    afterRead:
      state === "conflict"
        ? () => {
            client.setFile(PATH, THEIRS);
            client.failNextWrite(new FakeRequestError(409, "file_conflict"));
          }
        : state === "save-failed"
          ? () => client.failNextWrite(new FakeRequestError(500))
          : state === "revoked-save"
            ? () => client.revoke()
            : state === "revoked-viewonly"
              ? () => {
                  client.revoke();
                  client.grant(["file.view"]);
                }
              : state === "gone-save" || state === "gone-returned"
                ? () => client.deleteFile(PATH)
                : state === "readonly-retry"
                  ? () => client.grant(["file.view", "file.edit"])
                  : undefined,
    afterWriteError:
      state === "gone-returned" ? () => client.setFile(PATH, THEIRS) : undefined,
  });
  if (state === "revoked") client.failNextRead(new FakeRequestError(403));
  if (state === "failed") client.failNextRead(new FakeRequestError(500));

  const host: AppHost = {
    client,
    initial: {
      locale,
      appearance: { colorScheme, tokens },
      file: state === "no-file" ? null : { spaceId: SPACE, path: PATH },
    },
    onLaunch() {
      return () => {};
    },
    onContext() {
      return () => {};
    },
    setTitle(title) {
      document.title = `${title} · score editor harness`;
    },
    setDirty() {},
    onBeforeClose() {},
  };

  createApp({ root: hostRoot, host });

  if (state.startsWith("handoff")) {
    watchChip(client);
    void (async () => {
      await handOff(hostRoot);
      if (state === "handoff-twice") {
        await until(() => (client.chips.length >= 1 ? true : null));
        await handOff(hostRoot);
      }
    })();
  }
}

boot();
