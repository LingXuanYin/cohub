import { createDialectRegistry, mount, type MountedEditor } from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createScoreHost,
  fileNameOf,
  type CohubFileClient,
  type HostFailure,
  type HostState,
  type OpenedScoreFile,
} from "../host/host.ts";
import { scoreThemeVars, type HostAppearance } from "../host/theme.ts";
import { frameCopy, languageFor, type Language } from "./copy.ts";
import { editorOptionsFor } from "./options.ts";
import { failurePresentation, stateCopy, type FailureAction } from "./policy.ts";
import { createFrameView, type FrameAction, type FrameView } from "./view.ts";

/** The host side of the App: the SDK in a published App, a fake one in the harness. */
export type AppHost = {
  readonly client: CohubFileClient;
  readonly initial: {
    readonly locale: string | null;
    readonly appearance: HostAppearance;
    /** The file the host opened, from the invocation context; a launch can replace it later. */
    readonly file: { readonly spaceId: string; readonly path: string } | null;
  };
  onLaunch(listener: (file: { readonly spaceId: string; readonly path: string }) => void): () => void;
  onContext(
    listener: (context: { readonly locale: string | null; readonly appearance: HostAppearance }) => void,
  ): () => void;
  setTitle(title: string): void;
  setDirty(dirty: boolean): void;
  onBeforeClose(handler: () => boolean): void;
};

const DIALECTS = createDialectRegistry([song2Dialect]);

type Mode = "loading" | "failure" | "editor" | "no-file";

export function createApp(options: { root: HTMLElement; host: AppHost }): { destroy(): void } {
  const { root, host } = options;
  let language: Language = languageFor(host.initial.locale);
  let appearance: HostAppearance = host.initial.appearance;
  const view: FrameView = createFrameView(root, language);
  const scoreHost = createScoreHost({ client: host.client, language });
  const stops: Array<() => void> = [];
  let editor: MountedEditor | null = null;
  let opened: OpenedScoreFile | null = null;
  let lastFile: { spaceId: string; path: string } | null = host.initial.file;
  let openRequest = 0;
  let mode: Mode = lastFile ? "loading" : "no-file";
  let failure: HostFailure | null = null;
  /** A message that overrides the state copy, e.g. "Access was not given." */
  let message: string | null = null;
  let readOnly = false;

  let appliedVars: string[] = [];
  const applyTheme = () => {
    const { vars, colorScheme } = scoreThemeVars(appearance);
    for (const property of appliedVars) root.style.removeProperty(property);
    appliedVars = Object.keys(vars);
    for (const [property, value] of Object.entries(vars)) root.style.setProperty(property, value);
    root.style.colorScheme = colorScheme;
  };

  const applyLanguage = () => {
    document.documentElement.lang = language;
  };

  const actionFor = (action: FailureAction): FrameAction | undefined => {
    const copy = frameCopy(language);
    if (action === "access") return { label: copy.askAccess, run: () => void askAccess() };
    if (action === "retry") return { label: copy.retry, run: () => retry() };
    return undefined;
  };

  const paint = () => {
    const copy = frameCopy(language);
    if (mode === "loading") {
      view.showLoading(stateCopy("loading", scoreHost.name() ?? lastFile?.path ?? null, language).title);
      return;
    }
    if (mode === "no-file") {
      view.showState(stateCopy("no-file", null, language));
      return;
    }
    if (mode === "failure" && failure) {
      const shown = failurePresentation(failure, {
        unsaved: editor?.hasUnsavedChanges() ?? false,
        name: scoreHost.name() ?? (lastFile ? fileNameOf(lastFile.path) : copy.scoreFileTag),
        language,
      });
      if (shown.keepEditor && editor) {
        mode = "editor";
        view.showEditor();
        view.showNotice({ text: message ?? shown.body, action: actionFor(shown.action) });
        host.setDirty(true);
        return;
      }
      editor?.destroy();
      editor = null;
      opened = null;
      host.setDirty(false);
      view.showState({ title: shown.title, body: message ?? shown.body, action: actionFor(shown.action) });
      return;
    }
    if (mode !== "editor") return;
    view.showEditor();
    if (message) {
      view.showNotice({ text: message, action: actionFor("access") });
    } else if (readOnly) {
      view.showNotice({
        text: copy.readOnlyBody,
        action: { label: copy.askEdit, run: () => void askAccess() },
      });
    }
  };

  const showFailure = (state: HostState) => {
    if (state.status === "ready" || state.status === "loading") return;
    failure = state;
    message = null;
    readOnly = false;
    mode = "failure";
    paint();
  };

  const mountEditor = (file: OpenedScoreFile) => {
    editor?.destroy();
    view.showEditor();
    editor = mount(view.editorElement, {
      ...editorOptionsFor(file, language),
      project: file.project,
      dialects: DIALECTS,
      onUnsavedChange: (unsaved) => host.setDirty(unsaved),
    });
    readOnly = !file.editable;
    view.editorElement.focus();
  };

  const open = async (file: { spaceId: string; path: string }) => {
    lastFile = file;
    const request = ++openRequest;
    opened = null;
    failure = null;
    message = null;
    readOnly = false;
    editor?.destroy();
    editor = null;
    host.setDirty(false);
    // Name the file before the read so loading and every failure show which file the window is about.
    view.setFile(fileNameOf(file.path), file.path, false);
    host.setTitle(fileNameOf(file.path));
    mode = "loading";
    paint();
    const result = await scoreHost.openFile(file);
    if (request !== openRequest) return;
    if (!result.ok) {
      failure = result.state;
      mode = "failure";
      paint();
      return;
    }
    opened = result;
    mode = "editor";
    view.setFile(result.name, result.path, result.editable);
    host.setTitle(result.name);
    mountEditor(result);
    paint();
  };

  const retry = () => {
    if (lastFile) void open(lastFile);
  };

  const askAccess = async () => {
    const outcome = await scoreHost.requestAccess();
    if (outcome !== "granted") {
      message = frameCopy(language).accessNotGiven;
      if (mode === "failure") paint();
      else view.setMessage(message);
      return;
    }
    message = null;
    if (editor?.hasUnsavedChanges()) {
      // The edits stay; a granted write permission lets the next save retry.
      failure = null;
      mode = "editor";
      readOnly = !scoreHost.editable();
      paint();
      return;
    }
    if (lastFile) void open(lastFile);
  };

  applyTheme();
  applyLanguage();
  view.setFile(
    lastFile ? fileNameOf(lastFile.path) : null,
    lastFile?.path ?? null,
    false,
  );
  if (lastFile) {
    mode = "loading";
    paint();
    void open(lastFile);
  } else {
    mode = "no-file";
    paint();
  }

  stops.push(
    scoreHost.subscribe((state) => {
      if (opened === null) return;
      showFailure(state);
    }),
  );
  stops.push(
    host.onLaunch((file) => {
      // The invocation context already opened this file; a repeat launch only brings the window forward.
      if (lastFile?.spaceId === file.spaceId && lastFile.path === file.path) return;
      const relaunch = scoreHost.relaunch(file);
      if (relaunch === "same") {
        view.setFile(scoreHost.name(), scoreHost.path(), scoreHost.editable());
        return;
      }
      if (relaunch === "moved") {
        lastFile = { spaceId: file.spaceId, path: file.path };
        const nextName = scoreHost.name();
        view.setFile(nextName, scoreHost.path(), scoreHost.editable());
        if (nextName) host.setTitle(nextName);
        return;
      }
      void open(file);
    }),
  );
  stops.push(
    host.onContext((next) => {
      appearance = next.appearance;
      applyTheme();
      const nextLanguage = languageFor(next.locale);
      if (nextLanguage === language) return;
      language = nextLanguage;
      scoreHost.setLanguage(language);
      applyLanguage();
      view.setLanguage(language);
      editor?.update({ language });
      if (mode === "loading" || mode === "failure" || mode === "no-file") {
        paint();
      } else if (mode === "editor") {
        paint();
      }
    }),
  );
  host.onBeforeClose(() => scoreHost.allowClose(editor?.hasUnsavedChanges() ?? false));

  return {
    destroy() {
      openRequest += 1;
      editor?.destroy();
      editor = null;
      for (const stop of stops) stop();
      view.destroy();
    },
  };
}
