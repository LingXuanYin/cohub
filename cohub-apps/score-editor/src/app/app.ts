import {
  createDialectRegistry,
  mount,
  type MountedEditor,
} from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createScoreHost,
  type CohubFileClient,
  type HostState,
  type OpenedScoreFile,
} from "../host/host.ts";
import { scoreThemeVars, type HostAppearance } from "../host/theme.ts";
import { languageFor, type Language } from "./copy.ts";
import { editorOptionsFor } from "./options.ts";
import { createFrameView, type FrameState, type FrameView } from "./view.ts";

/** The host side of the App: the SDK in a published App, a fake one in the harness. */
export type AppHost = {
  readonly client: CohubFileClient;
  readonly initial: { readonly locale: string | null; readonly appearance: HostAppearance };
  onLaunch(listener: (file: { readonly spaceId: string; readonly path: string }) => void): () => void;
  onContext(
    listener: (context: { readonly locale: string | null; readonly appearance: HostAppearance }) => void,
  ): () => void;
  setTitle(title: string): void;
  setDirty(dirty: boolean): void;
  onBeforeClose(handler: () => boolean): void;
};

const DIALECTS = createDialectRegistry([song2Dialect]);

function frameStateOf(state: HostState): FrameState | null {
  switch (state.status) {
    case "no-permission":
      return state.reason === "revoked" ? "no-permission-revoked" : "no-permission-missing";
    case "file-gone":
      return "file-gone";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

export function createApp(options: { root: HTMLElement; host: AppHost }): { destroy(): void } {
  const { root, host } = options;
  let language: Language = languageFor(host.initial.locale);
  let appearance: HostAppearance = host.initial.appearance;
  const view: FrameView = createFrameView(root, language);
  const scoreHost = createScoreHost({ client: host.client, language });
  const stops: Array<() => void> = [];
  let editor: MountedEditor | null = null;
  let opened: OpenedScoreFile | null = null;
  let lastFile: { spaceId: string; path: string } | null = null;
  let openRequest = 0;

  const applyTheme = () => {
    const { vars, colorScheme } = scoreThemeVars(appearance);
    for (const [property, value] of Object.entries(vars)) root.style.setProperty(property, value);
    root.style.colorScheme = colorScheme;
  };

  const showFailure = (state: HostState) => {
    const next = frameStateOf(state);
    if (next === null) return;
    editor?.destroy();
    editor = null;
    opened = null;
    host.setDirty(false);
    view.showState(next, next === "failed" ? () => void retry() : undefined);
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
  };

  const open = async (file: { spaceId: string; path: string }) => {
    lastFile = file;
    const request = ++openRequest;
    opened = null;
    editor?.destroy();
    editor = null;
    view.showState("loading");
    host.setDirty(false);
    const result = await scoreHost.openFile(file);
    if (request !== openRequest) return;
    if (!result.ok) {
      view.showState(frameStateOf(result.state) ?? "failed", () => void retry());
      return;
    }
    opened = result;
    view.setFile(result.name, result.path, result.editable);
    host.setTitle(result.name);
    mountEditor(result);
  };

  const retry = () => {
    if (lastFile) void open(lastFile);
  };

  applyTheme();
  view.setFile(null, null, false);
  view.showState("loading");

  stops.push(
    scoreHost.subscribe((state) => {
      if (opened === null) return;
      showFailure(state);
    }),
  );
  stops.push(
    host.onLaunch((file) => {
      const relaunch = scoreHost.relaunch(file);
      if (relaunch === "same") {
        view.setFile(scoreHost.name(), scoreHost.path(), scoreHost.editable());
        return;
      }
      if (relaunch === "moved") {
        const name = scoreHost.name();
        view.setFile(name, scoreHost.path(), scoreHost.editable());
        if (name) host.setTitle(name);
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
      view.setLanguage(language);
      editor?.update({ language });
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
