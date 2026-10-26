import { createApp, type AppHost } from "../src/app/app.ts";
import "../src/app/styles.css";
import { createFakeClient, FakeRequestError } from "../tests/fake-client.ts";

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
const PATH = "scores/intro.abc";

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
  brand: "#2457d6",
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
  brand: "#7da3ff",
  "font-sans": 'system-ui, -apple-system, "Segoe UI", sans-serif',
};

const params = new URLSearchParams(location.search);
const state = params.get("state") ?? "editable";
const locale = params.get("lang") === "zh" ? "zh-CN" : "en-US";
const colorScheme = params.get("theme") === "light" ? "light" : "dark";
const tokens = colorScheme === "light" ? LIGHT : DARK;
for (const [token, value] of Object.entries(tokens)) {
  document.documentElement.style.setProperty(`--cohub-${token}`, value);
}

const client = createFakeClient({
  files: state === "file-gone" ? {} : { [PATH]: SAMPLE },
  scopes: state === "readonly" ? ["file.view"] : ["file.view", "file.edit"],
  authorize: state === "no-permission" ? "cancelled" : "granted",
  neverResolveRead: state === "loading",
  afterRead:
    state === "conflict"
      ? () => {
          client.setFile(PATH, THEIRS);
          client.failNextWrite(new FakeRequestError(409, "file_conflict"));
        }
      : state === "save-failed"
        ? () => client.failNextWrite(new FakeRequestError(500))
        : undefined,
});
if (state === "revoked") client.failNextRead(new FakeRequestError(403));
if (state === "failed") client.failNextRead(new FakeRequestError(500));

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("The harness page has no #app element.");

const host: AppHost = {
  client,
  initial: { locale, appearance: { colorScheme, tokens } },
  onLaunch(listener) {
    queueMicrotask(() => listener({ spaceId: SPACE, path: PATH }));
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

createApp({ root, host });
