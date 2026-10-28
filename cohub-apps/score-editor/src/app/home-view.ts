import type { HomeFile, HomeSong } from "./home.ts";
import { formatHomeFullTime, formatHomeTime } from "./home.ts";
import { frameCopy, type FrameCopy, type Language } from "./copy.ts";
import type { FrameAction } from "./view.ts";

export type HomeSectionState = "loading" | "ready" | "error" | "denied";

export type HomeModel = {
  readonly language: Language;
  readonly songs: readonly HomeSong[];
  readonly files: readonly HomeFile[];
  readonly songsState: HomeSectionState;
  readonly filesState: HomeSectionState;
  readonly songsHasMore: boolean;
  readonly loadingSongs: boolean;
  readonly canWrite: boolean;
  readonly readOnly: boolean;
  readonly workingName: string | null;
  readonly listedIsContext: boolean;
  readonly fileLimit: number;
  readonly checking: string | null;
  readonly busy: "new" | "pick" | "copy" | null;
  readonly accessRequired: boolean;
  readonly notice: { readonly text: string; readonly tone: "info" | "problem"; readonly action?: FrameAction } | null;
};

export type HomeActions = {
  readonly newScore: () => void;
  readonly pickSpace: () => void;
  readonly backToContext: () => void;
  readonly backToWorking: () => void;
  readonly openSong: (id: string) => void;
  readonly openFile: (path: string) => void;
  readonly copySong: (id: string) => void;
  readonly copyFile: (path: string) => void;
  readonly loadMoreSongs: () => void;
  readonly showMoreFiles: () => void;
  readonly retrySongs: () => void;
  readonly retryFiles: () => void;
  readonly askSongs: () => void;
  readonly askFiles: () => void;
  readonly askAll: () => void;
  readonly askEdit: () => void;
  readonly cancelCheck: () => void;
};

export type HomeView = {
  readonly element: HTMLElement;
  render(model: HomeModel): void;
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

function actionButton(
  parent: HTMLElement,
  className: string,
  label: string,
  run: () => void,
): HTMLButtonElement {
  const button = element("button", className, parent);
  button.type = "button";
  button.textContent = label;
  button.onclick = () => run();
  return button;
}

export function createHomeView(
  root: HTMLElement,
  language: Language,
  actions: HomeActions,
): HomeView {
  let copy: FrameCopy = frameCopy(language);
  let currentLanguage = language;
  const app = element("section", "frame home", root);
  const bar = element("header", "frame-bar home-bar", app);
  const heading = element("div", "frame-heading", bar);
  const title = element("h1", "frame-name home-title", heading);
  const barActions = element("div", "home-bar-actions", bar);
  const newScore = actionButton(barActions, "frame-action home-new", copy.newScore, actions.newScore);
  newScore.dataset.homeAction = "new-score";

  const banner = element("div", "home-banner", app);
  const bannerText = element("p", "home-banner-text", banner);
  const bannerActions = element("div", "home-banner-actions", banner);

  const scroll = element("div", "home-scroll", app);
  const body = element("div", "home-body", scroll);
  const notice = element("div", "home-notice", body);
  const noticeText = element("p", "home-notice-text", notice);
  const noticeAction = element("button", "home-text-action", notice);
  noticeAction.type = "button";

  const songsSection = element("section", "home-section", body);
  const songsTitle = element("h2", "home-section-title", songsSection);
  const songsList = element("div", "home-list", songsSection);
  const songsFoot = element("div", "home-section-foot", songsSection);

  const filesSection = element("section", "home-section", body);
  const filesTitle = element("h2", "home-section-title", filesSection);
  const filesList = element("div", "home-list", filesSection);
  const filesFoot = element("div", "home-section-foot", filesSection);

  const access = element("section", "home-access", body);
  const accessTitle = element("h2", "frame-state-title", access);
  const accessBody = element("p", "frame-state-body", access);
  const accessAction = actionButton(access, "frame-action", copy.askAccess, actions.askAll);
  access.hidden = true;

  const empty = element("section", "home-empty", body);
  const emptyTitle = element("h2", "frame-state-title", empty);
  const emptyBody = element("p", "frame-state-body", empty);

  const live = element("p", "frame-live", app);
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");

  const setText = (node: HTMLElement, value: string) => {
    if (node.textContent !== value) node.textContent = value;
  };

  const headingFor = (model: HomeModel): { text: string; tone: "info" | "problem" } | null => {
    if (model.workingName !== null && !model.listedIsContext) {
      const text = copy.workingIn.replaceAll("{space}", model.workingName);
      return { text: model.readOnly ? `${text} · ${copy.viewOnly}` : text, tone: "info" };
    }
    if (model.workingName !== null && model.listedIsContext) {
      return { text: `${copy.viewingContext} · ${model.workingName}`, tone: "info" };
    }
    if (model.readOnly && model.listedIsContext) {
      return { text: copy.readOnlySpace, tone: "info" };
    }
    return null;
  };

  const renderBanner = (model: HomeModel) => {
    const text = headingFor(model);
    banner.hidden = text === null;
    bannerActions.replaceChildren();
    if (text === null) return;
    bannerText.textContent = text.text;
    banner.dataset.tone = text.tone;
    if (model.workingName !== null && !model.listedIsContext) {
      const back = actionButton(bannerActions, "home-text-action", copy.backToContext, actions.backToContext);
      back.dataset.homeAction = "back-context";
    }
    if (model.workingName !== null && model.listedIsContext) {
      const back = actionButton(
        bannerActions,
        "home-text-action",
        copy.backToWorking.replaceAll("{space}", model.workingName),
        actions.backToWorking,
      );
      back.dataset.homeAction = "back-working";
    }
    if (model.workingName === null && model.readOnly) {
      const pick = actionButton(bannerActions, "home-text-action", copy.workInYourSpace, actions.pickSpace);
      pick.dataset.homeAction = "pick-space";
    } else {
      const pick = actionButton(bannerActions, "home-text-action", copy.pickSpace, actions.pickSpace);
      pick.dataset.homeAction = "pick-space";
    }
  };

  const renderNotice = (model: HomeModel) => {
    notice.hidden = model.notice === null;
    noticeAction.hidden = true;
    noticeAction.onclick = null;
    if (model.notice === null) return;
    notice.dataset.tone = model.notice.tone;
    noticeText.textContent = model.notice.text;
    if (model.notice.action) {
      noticeAction.hidden = false;
      noticeAction.textContent = model.notice.action.label;
      noticeAction.onclick = () => model.notice?.action?.run();
    }
  };

  const renderRow = (
    list: HTMLElement,
    input: {
      readonly title: string;
      readonly meta: string;
      readonly time: string;
      readonly fullTime: string;
      readonly tag?: string;
      readonly hint?: string;
      readonly path: string;
      readonly checking: boolean;
      readonly disabled?: boolean;
      readonly copyLabel: string | null;
      readonly onOpen: () => void;
      readonly onCopy: (() => void) | null;
    },
  ) => {
    const row = element("div", "home-row", list);
    if (input.hint) row.title = input.hint;
    const main = element("button", "home-row-main", row);
    main.type = "button";
    main.disabled = input.checking || (input.disabled ?? false);
    const copyLine = element("span", "home-row-title", main);
    copyLine.textContent = input.title;
    if (input.tag) {
      const tag = element("span", "home-tag", copyLine);
      tag.textContent = input.tag;
    }
    const meta = element("span", "home-row-meta", main);
    if (input.checking) {
      meta.textContent = copy.copyCheck;
    } else if (input.meta) {
      meta.textContent = input.meta;
    } else {
      meta.hidden = true;
    }
    const time = element("time", "home-row-time", main);
    time.dateTime = input.fullTime;
    time.title = input.fullTime;
    time.textContent = input.time;
    if (input.checking) {
      const cancel = actionButton(row, "home-text-action", copy.cancel, actions.cancelCheck);
      cancel.dataset.action = "cancel-check";
    } else {
      main.onclick = input.onOpen;
      if (input.copyLabel && input.onCopy) {
        const copyButton = actionButton(row, "home-text-action home-row-copy", input.copyLabel, input.onCopy);
        copyButton.dataset.action = "copy-row";
      }
    }
    return row;
  };

  const skeleton = (list: HTMLElement, count: number) => {
    for (let index = 0; index < count; index += 1) {
      const row = element("div", "home-row home-row-skeleton", list);
      row.setAttribute("aria-hidden", "true");
      element("span", "home-skeleton-title", row);
      element("span", "home-skeleton-meta", row);
    }
  };

  const sectionFoot = (foot: HTMLElement, label: string, run: () => void) => {
    foot.replaceChildren();
    actionButton(foot, "home-text-action", label, run);
  };

  const renderSection = (
    heading: HTMLElement,
    list: HTMLElement,
    foot: HTMLElement,
    state: HomeSectionState,
    rows: number,
    options: {
      readonly label: string;
      readonly loading: boolean;
      readonly retry: () => void;
      readonly ask: () => void;
      readonly more: (() => void) | null;
    },
  ) => {
    heading.textContent = options.label;
    list.replaceChildren();
    foot.replaceChildren();
    if (state === "loading" && rows === 0) {
      skeleton(list, 4);
      return;
    }
    if (state === "error") {
      const error = element("div", "home-section-message", list);
      error.textContent = options.label === copy.songs ? copy.songsFailed : copy.filesFailed;
      actionButton(error, "home-text-action", copy.retry, options.retry);
      return;
    }
    if (state === "denied") {
      const denied = element("div", "home-section-message", list);
      denied.textContent = options.label === copy.songs ? copy.songsNeedAccess : copy.filesNeedAccess;
      actionButton(denied, "home-text-action", copy.askAccess, options.ask);
      return;
    }
    if (options.loading && rows > 0) skeleton(list, 1);
    if (state === "ready" && options.more) {
      sectionFoot(foot, copy.showMore, options.more);
    }
  };

  const render = (model: HomeModel) => {
    if (model.language !== currentLanguage) {
      currentLanguage = model.language;
      copy = frameCopy(model.language);
      setText(newScore, copy.newScore);
    }
    setText(title, copy.homeTitle);
    newScore.hidden = !model.canWrite;
    newScore.disabled = model.busy !== null;
    newScore.textContent = model.busy === "new" ? copy.creating : copy.newScore;
    renderBanner(model);
    renderNotice(model);
    access.hidden = !model.accessRequired;
    if (model.accessRequired) {
      banner.hidden = true;
      notice.hidden = true;
      songsSection.hidden = true;
      filesSection.hidden = true;
      empty.hidden = true;
      accessTitle.textContent = copy.homeAccessTitle;
      accessBody.textContent = model.notice?.text ?? copy.homeAccessBody;
      accessAction.textContent = copy.askAccess;
    }

    const showEmpty =
      model.songsState === "ready" &&
      model.filesState === "ready" &&
      model.songs.length === 0 &&
      model.files.length === 0;
    empty.hidden = !showEmpty;
    emptyTitle.textContent = copy.homeEmptyTitle;
    emptyBody.textContent = copy.homeEmptyBody;

    renderSections(model);
    live.textContent = model.notice?.text ?? "";
  };

  const renderSections = (model: HomeModel) => {
    if (model.accessRequired) {
      songsSection.hidden = true;
      filesSection.hidden = true;
      return;
    }
    const copyLabel =
      model.listedIsContext && model.readOnly
        ? model.workingName === null
          ? copy.copyToYourSpace
          : copy.copyToWorking.replaceAll("{space}", model.workingName)
        : null;
    const canCopy =
      copyLabel !== null && (model.workingName !== null ? model.canWrite : true);
    const locked = model.checking !== null;
    const files = model.files.slice(0, model.fileLimit);

    songsSection.hidden = model.songsState === "ready" && model.songs.length === 0;
    filesSection.hidden = model.filesState === "ready" && files.length === 0;

    renderSection(songsTitle, songsList, songsFoot, model.songsState, model.songs.length, {
      label: copy.songs,
      loading: model.loadingSongs,
      retry: actions.retrySongs,
      ask: actions.askSongs,
      more: model.songsHasMore ? actions.loadMoreSongs : null,
    });
    for (const song of model.songs) {
      renderRow(songsList, {
        title: song.title || copy.untitledSong,
        meta: song.style,
        time: formatHomeTime(song.createdAt, currentLanguage),
        fullTime: formatHomeFullTime(song.createdAt, currentLanguage),
        path: song.id,
        checking: false,
        disabled: locked,
        copyLabel: canCopy ? copyLabel : null,
        onOpen: () => actions.openSong(song.id),
        onCopy: canCopy ? () => actions.copySong(song.id) : null,
      });
    }

    renderSection(filesTitle, filesList, filesFoot, model.filesState, files.length, {
      label: copy.scoreFiles,
      loading: model.filesState === "loading",
      retry: actions.retryFiles,
      ask: actions.askFiles,
      more: model.files.length > files.length ? actions.showMoreFiles : null,
    });
    for (const file of files) {
      renderRow(filesList, {
        title: file.name,
        meta: file.folder || copy.spaceRoot,
        time: formatHomeTime(file.mtimeMs, currentLanguage),
        fullTime: formatHomeFullTime(file.mtimeMs, currentLanguage),
        tag: file.copyTaskId ? copy.generatedCopyTag : undefined,
        hint: file.copyTaskId ? copy.generatedCopyHint : undefined,
        path: file.path,
        checking: model.checking === file.path,
        disabled: locked && model.checking !== file.path,
        copyLabel: canCopy ? copyLabel : null,
        onOpen: () => actions.openFile(file.path),
        onCopy: canCopy ? () => actions.copyFile(file.path) : null,
      });
    }
  };

  return {
    element: app,
    render,
    destroy() {
      app.remove();
    },
  };
}
