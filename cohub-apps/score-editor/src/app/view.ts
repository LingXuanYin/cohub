import { frameCopy, type FrameCopy, type Language } from "./copy.ts";
import { folderLabel, type ScoreKind, type StateContent } from "./policy.ts";

export type FrameAction = { readonly label: string; readonly run: () => void };

export type FrameView = {
  readonly editorElement: HTMLElement;
  setFile(name: string | null, path: string | null, editable: boolean, kind?: ScoreKind): void;
  setLanguage(language: Language): void;
  showLoading(title: string): void;
  showState(content: StateContent & { readonly action?: FrameAction }): void;
  showEditor(): void;
  showNotice(input: { readonly text: string; readonly action?: FrameAction }): void;
  clearNotice(): void;
  setMessage(text: string): void;
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

function setAction(button: HTMLButtonElement, action: FrameAction | undefined) {
  button.hidden = action === undefined;
  if (!action) {
    button.onclick = null;
    return;
  }
  button.textContent = action.label;
  button.onclick = () => action.run();
}

export function createFrameView(root: HTMLElement, language: Language): FrameView {
  let copy: FrameCopy = frameCopy(language);
  let kind: ScoreKind = "scoreFile";
  const tagFor = () => (kind === "generated" ? copy.generatedScoreTag : copy.scoreFileTag);

  const app = element("div", "frame", root);
  const bar = element("header", "frame-bar", app);
  const heading = element("div", "frame-heading", bar);
  const name = element("h1", "frame-name", heading);
  const tag = element("span", "frame-tag", heading);
  const path = element("span", "frame-path", bar);

  const notice = element("div", "frame-notice", app);
  const noticeText = element("p", "frame-notice-text", notice);
  const noticeAction = element("button", "frame-action", notice);
  noticeAction.type = "button";

  const stage = element("main", "frame-stage", app);
  const progress = element("div", "frame-progress", stage);
  progress.setAttribute("aria-hidden", "true");

  const panel = element("section", "frame-state", stage);
  const panelCopy = element("div", "frame-state-copy", panel);
  const title = element("h2", "frame-state-title", panelCopy);
  title.tabIndex = -1;
  const body = element("p", "frame-state-body", panelCopy);
  const action = element("button", "frame-action", panel);
  action.type = "button";

  const editor = element("div", "frame-editor", stage);
  editor.tabIndex = -1;
  const live = element("p", "frame-live", app);
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");

  name.textContent = "";
  tag.textContent = tagFor();
  path.textContent = "";
  notice.hidden = true;
  panel.hidden = true;
  body.hidden = true;
  action.hidden = true;
  noticeAction.hidden = true;

  const announce = (content: StateContent) => {
    live.textContent = content.body ? `${content.title} ${content.body}` : content.title;
  };

  return {
    editorElement: editor,
    setFile(nextName, nextPath, editable, nextKind = "scoreFile") {
      kind = nextKind;
      name.textContent = nextName ?? "";
      heading.title = nextName ?? "";
      const folder = nextPath ? folderLabel(nextPath) : null;
      path.textContent = folder ?? "";
      path.hidden = folder === null;
      path.title = nextPath ?? "";
      tag.textContent = tagFor();
      tag.hidden = nextName === null;
      app.dataset.editable = String(editable);
    },
    setLanguage(next) {
      copy = frameCopy(next);
      tag.textContent = tagFor();
    },
    showLoading(titleText) {
      const wasVisible = !panel.hidden;
      notice.hidden = true;
      panel.hidden = false;
      editor.hidden = true;
      progress.hidden = false;
      stage.setAttribute("aria-busy", "true");
      title.textContent = titleText;
      body.hidden = true;
      action.hidden = true;
      if (wasVisible) title.focus();
    },
    showState(content) {
      notice.hidden = true;
      panel.hidden = false;
      editor.hidden = true;
      progress.hidden = true;
      stage.setAttribute("aria-busy", "false");
      title.textContent = content.title;
      body.textContent = content.body;
      body.hidden = content.body === "";
      setAction(action, content.action);
      announce(content);
      title.focus();
    },
    showEditor() {
      panel.hidden = true;
      editor.hidden = false;
      notice.hidden = true;
      progress.hidden = true;
      stage.setAttribute("aria-busy", "false");
      live.textContent = "";
    },
    showNotice(input) {
      notice.hidden = false;
      noticeText.textContent = input.text;
      setAction(noticeAction, input.action);
      live.textContent = input.text;
    },
    clearNotice() {
      notice.hidden = true;
      noticeText.textContent = "";
      setAction(noticeAction, undefined);
      live.textContent = "";
    },
    setMessage(text) {
      if (!notice.hidden) {
        noticeText.textContent = text;
        live.textContent = text;
        return;
      }
      body.textContent = text;
      body.hidden = text === "";
      live.textContent = `${title.textContent ?? ""} ${text}`;
    },
    destroy() {
      app.remove();
    },
  };
}
