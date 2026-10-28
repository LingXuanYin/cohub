import type { FrameAction } from "./view.ts";
import { frameCopy, type Language } from "./copy.ts";
import { createHomeView, type HomeModel, type HomeSectionState, type HomeView } from "./home-view.ts";
import { copySongId, homeFileRow, sortHomeSongs, type HomeFile, type HomeSong } from "./home.ts";
import { homeSongRows, NEW_SCORE_TEXT } from "./home.ts";
import { authorizeHome, copyScoreToSpace, createNewScore, listHomeSongs, pickWorkingSpace, walkScoreFiles } from "../host/home.ts";
import { statusOf } from "../host/errors.ts";
import type { CohubAppClient } from "../host/host.ts";
import { HOME_SCOPES } from "../host/home.ts";

export type HomeOpenTarget = {
  readonly spaceId: string;
  readonly scopes: readonly string[];
  readonly kind: "file" | "generated";
  readonly path?: string;
  readonly taskRunId?: string;
  readonly file?: { readonly spaceId: string; readonly path: string };
};

export type HomeController = {
  start(contextSpaceId: string | null): Promise<void>;
  show(): void;
  hide(): void;
  refresh(): Promise<void>;
  setLanguage(language: Language): void;
  workingSpace(): { readonly id: string; readonly name: string | null } | null;
  destroy(): void;
};

type SpaceRef = { readonly id: string; readonly name: string | null };

export function createHomeController(options: {
  readonly root: HTMLElement;
  readonly client: CohubAppClient;
  readonly language: Language;
  readonly onOpen: (target: HomeOpenTarget) => void;
  readonly onTitle: (title: string) => void;
}): HomeController {
  let language = options.language;
  let contextId: string | null = null;
  let contextScopes: readonly string[] = [];
  let workingSpace: SpaceRef | null = null;
  let workingScopes: readonly string[] = [];
  let listed: "context" | "working" = "context";
  let authorized = false;
  let accessRequired = false;
  let view: HomeView | null = null;
  let songsRequest = 0;
  let filesRequest = 0;
  let check = 0;
  let songs: HomeSong[] = [];
  let files: HomeFile[] = [];
  let songsState: HomeSectionState = "loading";
  let filesState: HomeSectionState = "loading";
  let refreshing = false;
  let refreshFailed = false;
  let hasSnapshot = false;
  let homeScroll = 0;
  let cursor: string | null = null;
  let hasMore = false;
  let loadingSongs = false;
  let fileLimit = 20;
  let checking: string | null = null;
  let copying: string | null = null;
  let busy: "new" | "pick" | "copy" | null = null;
  let slowSongs = false;
  let slowFiles = false;
  let rowError: { readonly key: string; readonly text: string; readonly retry: () => void } | null = null;
  let notice: { readonly text: string; readonly tone: "info" | "problem"; readonly action?: FrameAction } | null = null;

  const copy = () => frameCopy(language);
  const spaceFor = (which: "context" | "working"): SpaceRef | null =>
    which === "context" ? (contextId === null ? null : { id: contextId, name: null }) : workingSpace;
  const scopesFor = (which: "context" | "working") => (which === "context" ? contextScopes : workingScopes);

  const setNotice = (text: string | null, tone: "info" | "problem" = "info", action?: FrameAction) => {
    notice = text === null ? null : { text, tone, ...(action ? { action } : {}) };
  };

  const ensureView = (): HomeView => {
    if (view) return view;
    view = createHomeView(options.root, language, {
      newScore: () => void newScore(),
      pickSpace: () => void pick(),
      backToContext: () => void loadSpace("context"),
      backToWorking: () => void loadSpace("working"),
      openSong: (id) => openSong(id),
      openFile: (path) => void openFile(path),
      copySong: (id) => void copySong(id),
      copyFile: (path) => void copyFile(path),
      loadMoreSongs: () => void loadMoreSongs(),
      showMoreFiles: () => {
        fileLimit += 20;
        render();
      },
      retrySongs: () => void loadSongs(),
      retryFiles: () => void loadFiles(),
      askSongs: () => void askAccess("songs"),
      askFiles: () => void askAccess("files"),
      askAll: () => void askAccess("all"),
      askEdit: () => void askEdit(),
      retryAll: () => void loadSpace(listed),
      retryRefresh: () => void refresh(),
      cancelCheck: () => {
        check += 1;
        checking = null;
        render();
      },
    });
    return view;
  };

  const model = (): HomeModel => {
    const scopes = scopesFor(listed);
    const isContext = listed === "context";
    return {
      language,
      songs,
      files,
      songsState,
      filesState,
      refreshing,
      refreshFailed,
      songsHasMore: hasMore,
      loadingSongs,
      canWrite: workingScopes.includes("file.edit"),
      readOnly: !scopes.includes("file.edit"),
      workingName:
        workingSpace && workingSpace.id !== contextId
          ? (workingSpace.name ?? copy().otherSpace)
          : null,
      listedIsContext: isContext,
      contextHasGrant: contextScopes.length > 0,
      fileLimit,
      checking,
      copying,
      busy,
      accessRequired,
      slowSongs,
      slowFiles,
      allFailed:
        !hasSnapshot &&
        songsState === "error" &&
        filesState === "error" &&
        songs.length === 0 &&
        files.length === 0,
      rowError,
      notice,
    };
  };

  const render = () => {
    view?.render(model());
    if (view && !view.element.hidden) options.onTitle(copy().homeTitle);
  };

  const applySongPage = (page: Awaited<ReturnType<typeof listHomeSongs>>, reset: boolean) => {
    songs = sortHomeSongs(reset ? page.rows : [...songs, ...page.rows]);
    cursor = page.nextCursor;
    hasMore = page.hasMore;
    files = files.map((file) => ({ ...file, copyTaskId: copySongId(file.text, songs) }));
    hasSnapshot = true;
  };

  const loadSongs = async (reset = true): Promise<void> => {
    const space = spaceFor(listed);
    if (!space) return;
    const scopes = scopesFor(listed);
    if (!scopes.includes("taskrun.view")) {
      songsState = "denied";
      loadingSongs = false;
      render();
      return;
    }
    songsState = reset && songs.length === 0 ? "loading" : songsState;
    loadingSongs = true;
    slowSongs = false;
    setTimeout(() => {
      if (loadingSongs && songs.length === 0) {
        slowSongs = true;
        render();
      }
    }, 400);
    render();
    const ticket = ++songsRequest;
    try {
      const page = await listHomeSongs({
        client: options.client,
        spaceId: space.id,
        limit: 20,
        ...(reset ? {} : { cursor }),
      });
      if (ticket !== songsRequest) return;
      applySongPage(page, reset);
      songsState = "ready";
      loadingSongs = false;
      slowSongs = false;
      render();
    } catch (error) {
      if (ticket !== songsRequest) return;
      loadingSongs = false;
      slowSongs = false;
      if (statusOf(error) === 401 || statusOf(error) === 403) {
        songsState = "denied";
      } else {
        songsState = "error";
      }
      render();
    }
  };

  const loadMoreSongs = async (): Promise<void> => {
    if (loadingSongs || !hasMore) return;
    loadingSongs = true;
    render();
    try {
      const space = spaceFor(listed);
      if (!space) return;
      const ticket = ++songsRequest;
      const page = await listHomeSongs({
        client: options.client,
        spaceId: space.id,
        limit: 20,
        cursor,
      });
      if (ticket !== songsRequest) return;
      applySongPage(page, false);
    } catch (error) {
      if (statusOf(error) === 401 || statusOf(error) === 403) {
        songsState = "denied";
      } else {
        setNotice(copy().songsFailed, "problem", {
          label: copy().retry,
          run: () => void loadMoreSongs(),
        });
      }
    } finally {
      loadingSongs = false;
      render();
    }
  };

  const refreshSongs = async (): Promise<"ok" | "failed" | "access" | "superseded"> => {
    const space = spaceFor(listed);
    if (!space) return "failed";
    const ticket = ++songsRequest;
    try {
      const page = await listHomeSongs({ client: options.client, spaceId: space.id, limit: 20 });
      if (ticket !== songsRequest) return "superseded";
      applySongPage(page, true);
      songsState = "ready";
      return "ok";
    } catch (error) {
      if (statusOf(error) === 401 || statusOf(error) === 403) {
        songsState = "denied";
        return "access";
      }
      return "failed";
    }
  };

  const refreshFiles = async (): Promise<"ok" | "failed" | "access" | "superseded"> => {
    const space = spaceFor(listed);
    if (!space) return "failed";
    const ticket = ++filesRequest;
    const next: HomeFile[] = [];
    try {
      for await (const batch of walkScoreFiles({
        client: options.client,
        spaceId: space.id,
        shouldStop: () => ticket !== filesRequest,
      })) {
        if (ticket !== filesRequest) return "superseded";
        next.push(...batch.map((found) => homeFileRow(found.entry, found.text, songs)));
      }
      if (ticket !== filesRequest) return "superseded";
      files = next.sort((a, b) => {
        const at = a.mtimeMs > 0 ? a.mtimeMs : Number.NEGATIVE_INFINITY;
        const bt = b.mtimeMs > 0 ? b.mtimeMs : Number.NEGATIVE_INFINITY;
        return bt - at || a.path.localeCompare(b.path);
      });
      filesState = "ready";
      hasSnapshot = true;
      return "ok";
    } catch (error) {
      if (statusOf(error) === 401 || statusOf(error) === 403) {
        filesState = "denied";
        accessRequired = true;
        return "access";
      }
      return "failed";
    }
  };

  const refresh = async (): Promise<void> => {
    if (!authorized || refreshing) return;
    const previousFailure = refreshFailed;
    refreshing = true;
    refreshFailed = false;
    render();
    const [songsResult, filesResult] = await Promise.all([refreshSongs(), refreshFiles()]);
    if (songsResult === "ok") {
      files = files.map((file) => ({ ...file, copyTaskId: copySongId(file.text, songs) }));
    }
    refreshing = false;
    const superseded = songsResult === "superseded" || filesResult === "superseded";
    if (superseded) {
      refreshFailed = previousFailure;
    } else {
      refreshFailed =
        songsResult !== "access" &&
        filesResult !== "access" &&
        (songsResult === "failed" || filesResult === "failed");
    }
    render();
  };

  const loadFiles = async (): Promise<void> => {
    const space = spaceFor(listed);
    if (!space) return;
    const scopes = scopesFor(listed);
    if (!scopes.includes("file.view")) {
      filesState = "denied";
      render();
      return;
    }
    const ticket = ++filesRequest;
    files = [];
    fileLimit = 20;
    filesState = "loading";
    slowFiles = false;
    setTimeout(() => {
      if (ticket === filesRequest && filesState === "loading") {
        slowFiles = true;
        render();
      }
    }, 400);
    render();
    try {
      for await (const batch of walkScoreFiles({
        client: options.client,
        spaceId: space.id,
        shouldStop: () => ticket !== filesRequest,
      })) {
        if (ticket !== filesRequest) return;
        const rows = batch.map((found) => homeFileRow(found.entry, found.text, songs));
        files = [...files, ...rows];
        filesState = "loading";
        render();
      }
      if (ticket !== filesRequest) return;
      filesState = "ready";
      slowFiles = false;
      hasSnapshot = true;
      files = [...files].sort((a, b) => {
        const at = a.mtimeMs > 0 ? a.mtimeMs : Number.NEGATIVE_INFINITY;
        const bt = b.mtimeMs > 0 ? b.mtimeMs : Number.NEGATIVE_INFINITY;
        return bt - at || a.path.localeCompare(b.path);
      });
      render();
    } catch (error) {
      if (ticket !== filesRequest) return;
      slowFiles = false;
      if (statusOf(error) === 401 || statusOf(error) === 403) {
        filesState = "denied";
        accessRequired = true;
      } else {
        filesState = "error";
      }
      render();
    }
  };

  const loadSpace = async (which: "context" | "working"): Promise<void> => {
    const space = spaceFor(which);
    if (!space) return;
    const switched = listed !== which;
    listed = which;
    songsRequest += 1;
    filesRequest += 1;
    check += 1;
    songs = [];
    files = [];
    cursor = null;
    hasMore = false;
    fileLimit = 20;
    checking = null;
    copying = null;
    slowSongs = false;
    slowFiles = false;
    rowError = null;
    notice = null;
    refreshing = false;
    refreshFailed = false;
    hasSnapshot = false;
    if (switched) {
      homeScroll = 0;
      view?.scrollTo(0);
    }
    songsState = scopesFor(which).includes("taskrun.view") ? "loading" : "denied";
    filesState = scopesFor(which).includes("file.view") ? "loading" : "denied";
    loadingSongs = false;
    render();
    await Promise.all([loadSongs(), loadFiles()]);
  };

  const openSong = (id: string): void => {
    const song = songs.find((item) => item.id === id);
    const space = spaceFor(listed);
    if (!song || !space) return;
    check += 1;
    checking = null;
    rowError = null;
    options.onOpen({
      spaceId: space.id,
      scopes: scopesFor(listed),
      kind: "generated",
      taskRunId: song.id,
    });
  };

  const openFile = async (path: string): Promise<void> => {
    const file = files.find((item) => item.path === path);
    const space = spaceFor(listed);
    if (!file || !space) return;
    const scopes = scopesFor(listed);
    const known = file.copyTaskId ?? copySongId(file.text, songs);
    if (known !== null) {
      if (!scopes.includes("taskrun.view")) {
        options.onOpen({ spaceId: space.id, scopes, kind: "file", path });
        return;
      }
      const ticket = ++check;
      checking = path;
      render();
      try {
        await options.client.getTask(known);
        if (ticket !== check) return;
      } catch (error) {
        if (ticket !== check) return;
        checking = null;
        if (statusOf(error) === 401 || statusOf(error) === 403) {
          songsState = "denied";
          rowError = null;
          render();
          return;
        }
        render();
        options.onOpen({ spaceId: space.id, scopes, kind: "file", path });
        return;
      }
      checking = null;
      render();
      options.onOpen({
        spaceId: space.id,
        scopes,
        kind: "generated",
        taskRunId: known,
        file: { spaceId: space.id, path },
      });
      return;
    }
    if (!scopes.includes("taskrun.view")) {
      options.onOpen({ spaceId: space.id, scopes, kind: "file", path });
      return;
    }
    const ticket = ++check;
    checking = path;
    render();
    try {
      let next: string | null = null;
      for (;;) {
        const page = await options.client.listTasks({
          spaceId: space.id,
          taskType: "generation",
          status: "completed",
          limit: 50,
          ...(next === null ? {} : { cursor: next }),
        });
        if (ticket !== check) return;
        const match = copySongId(file.text, homeSongRows(page.runs));
        if (match !== null) {
          checking = null;
          render();
          options.onOpen({
            spaceId: space.id,
            scopes,
            kind: "generated",
            taskRunId: match,
            file: { spaceId: space.id, path },
          });
          return;
        }
        if (!page.hasMore || page.nextCursor === null || page.nextCursor === next) break;
        next = page.nextCursor;
      }
      if (ticket !== check) return;
      checking = null;
      render();
      options.onOpen({ spaceId: space.id, scopes, kind: "file", path });
    } catch (error) {
      if (ticket !== check) return;
      checking = null;
      if (statusOf(error) === 401 || statusOf(error) === 403) {
        songsState = "denied";
        rowError = null;
      } else {
        rowError = { key: path, text: copy().copyCheckFailed, retry: () => void openFile(path) };
      }
      render();
    }
  };

  const askAccess = async (which: "songs" | "files" | "all"): Promise<void> => {
    const space = spaceFor(listed);
    if (!space) return;
    check += 1;
    rowError = null;
    const answer = await authorizeHome({
      client: options.client,
      spaceId: space.id,
      reason: copy().homeAuthReason,
      fallback: "none",
    });
    if (answer.status !== "granted" || answer.space.id !== space.id) {
      setNotice(
        answer.status === "denied" && answer.code === "failed" ? copy().askFailed : copy().accessNotGiven,
        "problem",
      );
      render();
      return;
    }
    accessRequired = false;
    authorized = true;
    setNotice(null);
    if (listed === "context") {
      contextScopes = answer.scopes;
      if (workingSpace?.id === contextId) workingScopes = answer.scopes;
    } else {
      workingScopes = answer.scopes;
    }
    if (which === "all") await loadSpace(listed);
    else if (which === "songs") await loadSongs();
    else await loadFiles();
  };

  const askEdit = async (): Promise<boolean> => {
    const space = workingSpace;
    if (!space) return false;
    if (workingScopes.includes("file.edit")) return true;
    try {
      const answer = await options.client.authorize({
        spaceId: space.id,
        scopes: ["file.edit"],
        reason: copy().homeAuthReason,
        fallback: "none",
      });
      if (answer.status !== "granted" || answer.space.id !== space.id) {
        setNotice(copy().accessNotGiven, "problem");
        render();
        return false;
      }
      const merged = [...new Set([...workingScopes, ...answer.scopes])];
      workingScopes = merged;
      if (space.id === contextId) contextScopes = [...new Set([...contextScopes, ...answer.scopes])];
      render();
      return true;
    } catch {
      setNotice(copy().askFailed, "problem");
      render();
      return false;
    }
  };

  const pick = async (): Promise<boolean> => {
    check += 1;
    checking = null;
    busy = "pick";
    render();
    try {
      const answer = await pickWorkingSpace({
        client: options.client,
        reason: copy().pickSpaceReason,
        scopes: HOME_SCOPES,
      });
      if (answer.status !== "granted") {
        setNotice(copy().pickDenied, "info");
        return false;
      }
      workingSpace = { id: answer.space.id, name: answer.space.name };
      workingScopes = answer.scopes;
      accessRequired = false;
      authorized = true;
      await loadSpace("working");
      return true;
    } catch {
      setNotice(copy().pickFailed, "problem");
      return false;
    } finally {
      busy = null;
      copying = null;
      render();
    }
  };

  const ensureWritable = async (): Promise<boolean> => {
    if (workingSpace === null) return false;
    if (workingSpace.id === contextId && !workingScopes.includes("file.edit")) {
      const picked = await pick();
      if (!picked) return false;
    }
    return askEdit();
  };

  const newScore = async (): Promise<void> => {
    if (busy) return;
    check += 1;
    checking = null;
    if (!(await ensureWritable())) return;
    const space = workingSpace;
    if (!space) return;
    rowError = null;
    busy = "new";
    setNotice(null);
    render();
    try {
      const result = await createNewScore({
        client: options.client,
        spaceId: space.id,
        text: NEW_SCORE_TEXT,
      });
      if (!result.ok) {
        setNotice(copy().newScoreFailed, "problem");
        return;
      }
      if (listed !== "working") homeScroll = 0;
      listed = "working";
      options.onOpen({
        spaceId: space.id,
        scopes: workingScopes,
        kind: "file",
        path: result.path,
      });
    } finally {
      busy = null;
      copying = null;
      render();
    }
  };

  const copyRow = async (input: {
    readonly key: string;
    readonly sourceFile: string | null;
    readonly taskRunId: string;
    readonly name: string | null;
    readonly text: string;
  }): Promise<void> => {
    if (busy) return;
    check += 1;
    checking = null;
    if (!(await ensureWritable())) return;
    const space = workingSpace;
    if (!space) return;
    rowError = null;
    copying = input.key;
    busy = "copy";
    render();
    try {
      const result = await copyScoreToSpace({
        client: options.client,
        spaceId: space.id,
        sourceFile: input.sourceFile,
        taskRunId: input.taskRunId,
        name: input.name,
        text: input.text,
      });
      if (!result.ok) {
        rowError = { key: input.key, text: copy().copyFailed, retry: () => void copyRow(input) };
        return;
      }
      if (listed !== "working") homeScroll = 0;
      listed = "working";
      options.onOpen({ spaceId: space.id, scopes: workingScopes, kind: "file", path: result.path });
    } finally {
      busy = null;
      copying = null;
      render();
    }
  };

  const copySong = async (id: string): Promise<void> => {
    const song = songs.find((item) => item.id === id);
    if (!song) return;
    await copyRow({
      key: id,
      sourceFile: null,
      taskRunId: song.id,
      name: song.title || null,
      text: song.score,
    });
  };

  const copyFile = async (path: string): Promise<void> => {
    const file = files.find((item) => item.path === path);
    if (!file) return;
    await copyRow({
      key: path,
      sourceFile: file.path,
      taskRunId: "",
      name: null,
      text: file.text,
    });
  };

  const start = async (contextSpaceId: string | null): Promise<void> => {
      contextId = contextSpaceId;
      if (contextSpaceId === null) return;
      ensureView().element.hidden = false;
      if (!authorized) {
        const answer = await authorizeHome({
          client: options.client,
          spaceId: contextSpaceId,
          reason: copy().homeAuthReason,
          fallback: "allow",
        });
        if (answer.status !== "granted") {
          authorized = false;
          accessRequired = true;
          contextScopes = [];
          workingSpace = { id: contextSpaceId, name: null };
          workingScopes = [];
          listed = "context";
          songsState = "denied";
          filesState = "denied";
          setNotice(null);
          render();
          return;
        }
        authorized = true;
        accessRequired = false;
        if (answer.space.id !== contextSpaceId) {
          // The host granted a different Space (the visitor's own), so this window works there.
          // The context Space keeps no grant and is never listed on the strength of being public.
          contextScopes = [];
          workingSpace = { id: answer.space.id, name: answer.space.name };
          workingScopes = answer.scopes;
          setNotice(null);
          await loadSpace("working");
          return;
        }
        contextScopes = answer.scopes;
        workingSpace = { id: contextSpaceId, name: answer.space.name };
        workingScopes = answer.scopes;
        listed = "context";
        setNotice(null);
        await loadSpace("context");
        return;
      }
      await loadSpace(listed);
  };

  return {
    start,
    show() {
      ensureView().element.hidden = false;
      render();
      view?.scrollTo(homeScroll);
    },
    hide() {
      songsRequest += 1;
      filesRequest += 1;
      check += 1;
      checking = null;
      homeScroll = view?.scrollTop() ?? homeScroll;
      if (view) view.element.hidden = true;
    },
    refresh,
    setLanguage(next) {
      language = next;
      render();
    },
    workingSpace: () => workingSpace,
    destroy() {
      songsRequest += 1;
      filesRequest += 1;
      check += 1;
      view?.destroy();
      view = null;
    },
  };
}
