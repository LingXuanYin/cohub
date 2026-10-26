import { frameCopy, type FrameCopy, type Language } from "./copy.ts";

export type FrameState =
  | "loading"
  | "no-permission-missing"
  | "no-permission-revoked"
  | "file-gone"
  | "failed"
  | "no-host";

export type FrameView = {
  readonly editorElement: HTMLElement;
  setFile(name: string | null, path: string | null, editable: boolean): void;
  setLanguage(language: Language): void;
  showState(state: FrameState, onRetry?: () => void): void;
  showEditor(): void;
  destroy(): void;
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.append(node);
  return node;
}

/** The directory part of a Space path; the file name is shown on its own line. */
function directoryOf(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  return slash <= 0 ? "/" : trimmed.slice(0, slash);
}

export function createFrameView(root: HTMLElement, language: Language): FrameView {
  let copy: FrameCopy = frameCopy(language);
  let retry: (() => void) | null = null;

  const app = element("div", "frame", root);
  const bar = element("header", "frame-bar", app);
  const heading = element("div", "frame-heading", bar);
  const name = element("span", "frame-name", heading);
  const tag = element("span", "frame-tag", heading);
  const path = element("span", "frame-path", bar);
  const stage = element("main", "frame-stage", app);
  const progress = element("div", "frame-progress", stage);
  progress.setAttribute("aria-hidden", "true");
  const panel = element("section", "frame-state", stage);
  const title = element("h1", "frame-state-title", panel);
  const body = element("p", "frame-state-body", panel);
  const action = element("button", "frame-action", panel);
  action.type = "button";
  action.addEventListener("click", () => retry?.());
  const editor = element("div", "frame-editor", stage);
  const live = element("p", "frame-live", app);
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");

  name.textContent = "";
  tag.textContent = copy.scoreFileTag;
  path.textContent = "";
  title.textContent = "";
  body.textContent = "";
  action.textContent = copy.retry;
  action.hidden = true;

  const states: Record<
    FrameState,
    { title: keyof FrameCopy; body: keyof FrameCopy | null; retry: boolean }
  > = {
    loading: { title: "opening", body: null, retry: false },
    "no-permission-missing": { title: "noPermissionTitle", body: "noPermissionBody", retry: false },
    "no-permission-revoked": { title: "revokedTitle", body: "revokedBody", retry: false },
    "file-gone": { title: "goneTitle", body: "goneBody", retry: false },
    failed: { title: "failedTitle", body: "failedBody", retry: true },
    "no-host": { title: "noHostTitle", body: "noHostBody", retry: false },
  };

  return {
    editorElement: editor,
    setFile(nextName, nextPath, editable) {
      name.textContent = nextName ?? "";
      heading.title = nextName ?? "";
      path.textContent = nextPath ? directoryOf(nextPath) : "";
      path.title = nextPath ?? "";
      tag.textContent = copy.scoreFileTag;
      tag.hidden = nextName === null;
      path.hidden = nextPath === null;
      app.dataset.editable = String(editable);
    },
    setLanguage(next) {
      copy = frameCopy(next);
      tag.textContent = copy.scoreFileTag;
      action.textContent = copy.retry;
      if (panel.hidden) return;
      const current = (stage.dataset.state as FrameState | undefined) ?? "loading";
      title.textContent = copy[states[current].title];
      const bodyKey = states[current].body;
      body.textContent = bodyKey ? copy[bodyKey] : "";
      body.hidden = bodyKey === null;
    },
    showState(state, onRetry) {
      retry = onRetry ?? null;
      stage.dataset.state = state;
      panel.hidden = false;
      editor.hidden = true;
      progress.hidden = state !== "loading";
      stage.setAttribute("aria-busy", String(state === "loading"));
      const next = states[state];
      title.textContent = copy[next.title];
      const bodyKey = next.body;
      body.textContent = bodyKey ? copy[bodyKey] : "";
      body.hidden = bodyKey === null;
      action.hidden = !next.retry;
      if (state !== "loading") live.textContent = copy[next.title];
    },
    showEditor() {
      stage.dataset.state = "ready";
      panel.hidden = true;
      editor.hidden = false;
      progress.hidden = true;
      stage.setAttribute("aria-busy", "false");
      live.textContent = "";
    },
    destroy() {
      app.remove();
    },
  };
}
