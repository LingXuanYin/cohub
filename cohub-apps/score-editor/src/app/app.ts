import { createDialectRegistry, mount, type MountedEditor } from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createScoreHost,
  fileNameOf,
  type CohubFileClient,
  type HostFailure,
  type HostState,
  type OpenedScore,
} from "../host/host.ts";
import { scoreThemeVars, type HostAppearance } from "../host/theme.ts";
import { frameCopy, languageFor, type Language } from "./copy.ts";
import { editorOptionsFor } from "./options.ts";
import { editorNotice, failurePresentation, stateCopy, type FailureAction } from "./policy.ts";
import { createFrameView, type FrameAction, type FrameView } from "./view.ts";

/** The host side of the App: the SDK in a published App, a fake one in the harness. */
export type AppHost = {
  readonly client: CohubFileClient;
  readonly initial: {
    readonly locale: string | null;
    readonly appearance: HostAppearance;
    /** The Space the App was opened in. */
    readonly spaceId: string | null;
    /** The file the host opened, from the invocation context; a launch can replace it later. */
    readonly file: { readonly spaceId: string; readonly path: string } | null;
    /** `?taskRun=` from the launch URL: the generation this open is about. */
    readonly taskRunId: string | null;
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
  let opened: OpenedScore | null = null;
  let lastFile: { spaceId: string; path: string } | null = host.initial.file;
  let taskRunId: string | null = host.initial.taskRunId;
  const appSpaceId = host.initial.spaceId ?? host.initial.file?.spaceId ?? null;
  let openRequest = 0;
  const launchKind = () => (taskRunId !== null ? "generated" : "scoreFile");
  let mode: Mode = taskRunId !== null || lastFile ? "loading" : "no-file";
  let failure: HostFailure | null = null;
  /** A message that overrides the state copy, e.g. "Access was not given." */
  let message: string | null = null;
  /** A one-time message from the editor (a draft save that failed, a refused command). */
  let packageNotice: string | null = null;

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
    if (action === "save-as") return { label: copy.saveAsNew, run: () => saveAsNew() };
    return undefined;
  };

  const paint = () => {
    const copy = frameCopy(language);
    if (mode === "loading") {
      view.showLoading(
        stateCopy("loading", scoreHost.name() ?? lastFile?.path ?? null, language, launchKind()).title,
      );
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
        kind: scoreHost.kind() ?? launchKind(),
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
    if (packageNotice) {
      view.showNotice({ text: packageNotice });
      return;
    }
    const notice = editorNotice({
      unsaved: editor?.hasUnsavedChanges() ?? false,
      editable: scoreHost.editable(),
      message,
      language,
      kind: scoreHost.kind() ?? launchKind(),
    });
    if (notice) {
      view.showNotice({
        text: notice.text,
        action: { label: copy.askEdit, run: () => void askAccess() },
      });
    } else {
      view.clearNotice();
    }
  };

  const showFailure = (state: HostState) => {
    if (state.status === "ready" || state.status === "loading") return;
    failure = state;
    message = null;
    mode = "failure";
    paint();
  };

  const mountEditor = (file: OpenedScore) => {
    editor?.destroy();
    view.showEditor();
    const base = editorOptionsFor(file, language);
    const generated =
      file.kind === "generated"
        ? {
            source: { kind: "generated" } as const,
            requiredInputs: ["style", "lyrics"] as const,
            ...(file.drafts ? { drafts: file.drafts } : {}),
            ...(file.saveAs ? { onSaveAs: (text: string) => void saveAs(text) } : {}),
          }
        : {};
    editor = mount(view.editorElement, {
      ...base,
      ...generated,
      project: file.project,
      dialects: DIALECTS,
      notify: (notice) => {
        packageNotice = notice.message;
        if (mode === "editor") paint();
      },
      onUnsavedChange: (unsaved) => {
        host.setDirty(unsaved);
        if (mode === "editor") paint();
      },
    });
    view.editorElement.focus();
  };

  const openScoreFile = async (file: { spaceId: string; path: string }) => {
    lastFile = file;
    const request = ++openRequest;
    opened = null;
    failure = null;
    message = null;
    packageNotice = null;
    editor?.destroy();
    editor = null;
    host.setDirty(false);
    // Name the file before the read so loading and every failure show which file the window is about.
    view.setFile(fileNameOf(file.path), file.path, false, "scoreFile");
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
    view.setFile(result.name, result.path, result.editable, result.kind);
    host.setTitle(result.name);
    mountEditor(result);
    paint();
  };

  const openGenerated = async () => {
    if (taskRunId === null || appSpaceId === null) {
      failure = { status: "no-permission", reason: "missing" };
      mode = "failure";
      paint();
      return;
    }
    const request = ++openRequest;
    opened = null;
    failure = null;
    message = null;
    packageNotice = null;
    editor?.destroy();
    editor = null;
    host.setDirty(false);
    view.setFile(null, lastFile?.path ?? null, false, "generated");
    mode = "loading";
    paint();
    const result = await scoreHost.openGenerated({
      spaceId: appSpaceId,
      taskRunId,
      file: lastFile,
    });
    if (request !== openRequest) return;
    if (!result.ok) {
      failure = result.state;
      mode = "failure";
      paint();
      return;
    }
    opened = result;
    mode = "editor";
    view.setFile(result.name, result.path, result.editable, result.kind);
    host.setTitle(result.name);
    mountEditor(result);
    paint();
  };

  const openCurrent = () => {
    if (taskRunId !== null) return openGenerated();
    if (lastFile) return openScoreFile(lastFile);
    mode = "no-file";
    paint();
    return Promise.resolve();
  };

  const retry = () => {
    void openCurrent();
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
      paint();
      return;
    }
    void openCurrent();
  };

  const saveAs = async (text: string) => {
    const result = await scoreHost.saveAs(text);
    if (!result.ok) {
      packageNotice = frameCopy(language).saveAsFailed;
      paint();
      return;
    }
    // The new score file is what this window holds from now on; open it in the same editor.
    taskRunId = null;
    await openScoreFile({ spaceId: scoreHost.spaceId() ?? appSpaceId ?? "", path: result.path });
  };

  const saveAsNew = () => {
    if (!editor) return;
    scoreHost.armCreateOnNextSave();
    // The package's documented save shortcut, so its keeper adopts the new version and clears the edits.
    view.editorElement.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }),
    );
  };

  applyTheme();
  applyLanguage();
  view.setFile(
    lastFile ? fileNameOf(lastFile.path) : null,
    lastFile?.path ?? null,
    false,
    launchKind(),
  );
  if (taskRunId !== null || lastFile) {
    mode = "loading";
    paint();
    void openCurrent();
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
      if (taskRunId !== null) {
        // A generated score's window follows the file only as its Save as place.
        lastFile = file;
        scoreHost.relaunch(file);
        view.setFile(scoreHost.name(), scoreHost.path(), scoreHost.editable(), "generated");
        return;
      }
      // The invocation context already opened this file; a repeat launch only brings the window forward.
      if (lastFile?.spaceId === file.spaceId && lastFile.path === file.path) return;
      const relaunch = scoreHost.relaunch(file);
      if (relaunch === "same") {
        view.setFile(scoreHost.name(), scoreHost.path(), scoreHost.editable(), "scoreFile");
        return;
      }
      if (relaunch === "moved") {
        lastFile = { spaceId: file.spaceId, path: file.path };
        const nextName = scoreHost.name();
        view.setFile(nextName, scoreHost.path(), scoreHost.editable(), "scoreFile");
        if (nextName) host.setTitle(nextName);
        return;
      }
      void openScoreFile(file);
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
