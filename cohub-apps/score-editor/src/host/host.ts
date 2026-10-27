import type { SongProject } from "@neta-art/score-editor";

/** The version a Space file is known at; the SDK reports both halves on every read and write. */
export type FileVersion = { readonly mtimeMs: number; readonly size: number };

export type ReadFileResult = { readonly text: string; readonly version: FileVersion };

/** What `auth.authorize` came to, narrowed to the fields this App acts on. */
export type AuthorizeResult =
  | { readonly status: "granted"; readonly scopes: readonly string[] }
  | { readonly status: "cancelled" }
  | { readonly status: "denied" };

/** The cohub calls the App needs, behind one seam so tests can stand in for the host. */
export type CohubFileClient = {
  authorize(input: {
    readonly spaceId: string;
    readonly scopes: readonly string[];
    readonly reason: string;
  }): Promise<AuthorizeResult>;
  read(input: { readonly spaceId: string; readonly path: string }): Promise<ReadFileResult>;
  /** `expected: null` creates the file; the server rejects the write if the path is taken. */
  write(input: {
    readonly spaceId: string;
    readonly path: string;
    readonly text: string;
    readonly expected: FileVersion | null;
  }): Promise<FileVersion>;
};

export type HostState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly editable: boolean; readonly name: string; readonly path: string }
  | { readonly status: "no-permission"; readonly reason: "missing" | "revoked" }
  | { readonly status: "file-gone" }
  | { readonly status: "failed" };

export type HostFailure = Extract<HostState, { status: "no-permission" | "file-gone" | "failed" }>;

/** What an editor needs to show one file; the source closes over the host so a rename is enough. */
export type OpenedScoreFile = {
  readonly ok: true;
  readonly project: SongProject;
  readonly source: {
    readonly kind: "scoreFile";
    readonly name: string;
    readonly version: string;
    save(text: string, expected: string): Promise<{ ok: true; version: string } | { ok: false; reason: "conflict" | "failed" }>;
    read(): Promise<{ text: string; version: string } | null>;
  };
  readonly editable: boolean;
  readonly name: string;
  readonly path: string;
};

export type OpenResult = OpenedScoreFile | { readonly ok: false; readonly state: HostFailure };

/** Versions are the host's opaque strings; `mtimeMs:size` is the pair the SDK gives and expects. */
export function versionString(version: FileVersion): string {
  return `${Math.trunc(version.mtimeMs)}:${version.size}`;
}

export function parseFileVersion(version: string): FileVersion | null {
  const match = /^(\d+):(\d+)$/.exec(version);
  if (!match) return null;
  const mtimeMs = Number(match[1]);
  const size = Number(match[2]);
  if (!Number.isSafeInteger(mtimeMs) || !Number.isSafeInteger(size)) return null;
  return { mtimeMs, size };
}

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function isConflict(error: unknown): boolean {
  return statusOf(error) === 409 && codeOf(error) === "file_conflict";
}

export function fileNameOf(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}

const MODEL_ID = "song2";

function projectFor(spaceId: string, path: string, text: string): SongProject {
  return {
    style: "",
    lyrics: "",
    score: text,
    scoreMode: "full",
    seed: null,
    modelId: MODEL_ID,
    sourceKey: `score-file:${spaceId}:${path}`,
  };
}

type Current = {
  spaceId: string;
  path: string;
  name: string;
  version: FileVersion;
  editable: boolean;
};

export type ScoreHost = {
  readonly client: CohubFileClient;
  openFile(input: { readonly spaceId: string; readonly path: string }): Promise<OpenResult>;
  /** Follows a launch: the same file again, a rename/move, or another space. */
  relaunch(input: { readonly spaceId: string; readonly path: string }): "same" | "moved" | "other";
  state(): HostState;
  subscribe(listener: (state: HostState) => void): () => void;
  setLanguage(language: "zh" | "en"): void;
  /** Asks for the access the current state is missing, then reports what the viewer chose. */
  requestAccess(): Promise<"granted" | "cancelled" | "denied">;
  /** The next save at the known version writes the same path as a new file, without a version. */
  armCreateOnNextSave(): void;
  /** Takes the create back when the save never ran or could not write. */
  disarmCreateOnNextSave(): void;
  /** The window may close without a prompt unless there are unsaved changes. */
  allowClose(unsaved: boolean): boolean;
  name(): string | null;
  path(): string | null;
  editable(): boolean;
};

const REASONS = {
  open: {
    en: "Open and save score files in this Space.",
    zh: "打开并保存这个 Space 里的乐谱文件。",
  },
  edit: {
    en: "Edit score files in this Space.",
    zh: "修改这个 Space 里的乐谱文件。",
  },
} as const;

export function createScoreHost(options: {
  client: CohubFileClient;
  language?: "zh" | "en";
  subscribe?: undefined;
}): ScoreHost {
  let language = options.language ?? "en";
  let current: Current | null = null;
  let lastSpaceId: string | null = null;
  let createOnNextSave = false;
  let state: HostState = { status: "loading" };
  const listeners = new Set<(state: HostState) => void>();

  const setState = (next: HostState) => {
    state = next;
    for (const listener of listeners) listener(next);
  };

  const readEntry = async (): Promise<{ text: string; version: FileVersion } | null> => {
    if (!current) return null;
    try {
      return await options.client.read({ spaceId: current.spaceId, path: current.path });
    } catch (error) {
      if (statusOf(error) === 403) setState({ status: "no-permission", reason: "revoked" });
      return null;
    }
  };

  const save = async (
    text: string,
    expected: string,
  ): Promise<{ ok: true; version: string } | { ok: false; reason: "conflict" | "failed" }> => {
    if (!current) return { ok: false, reason: "failed" };
    const recreate = createOnNextSave && expected === versionString(current.version);
    createOnNextSave = false;
    if (recreate) {
      // Recreating a deleted file: read first, so a file that came back is a conflict, not an overwrite.
      let exists = true;
      try {
        await options.client.read({ spaceId: current.spaceId, path: current.path });
      } catch (error) {
        if (statusOf(error) === 404) {
          exists = false;
        } else {
          if (statusOf(error) === 403) setState({ status: "no-permission", reason: "revoked" });
          return { ok: false, reason: "failed" };
        }
      }
      if (exists) return { ok: false, reason: "conflict" };
      try {
        const written = await options.client.write({
          spaceId: current.spaceId,
          path: current.path,
          text,
          expected: null,
        });
        current.version = written;
        setState({ status: "ready", editable: current.editable, name: current.name, path: current.path });
        return { ok: true, version: versionString(written) };
      } catch (error) {
        if (statusOf(error) === 403) setState({ status: "no-permission", reason: "revoked" });
        return { ok: false, reason: "failed" };
      }
    }
    const version = parseFileVersion(expected) ?? current.version;
    try {
      const written = await options.client.write({
        spaceId: current.spaceId,
        path: current.path,
        text,
        expected: version,
      });
      current.version = written;
      if (state.status !== "ready") {
        setState({ status: "ready", editable: current.editable, name: current.name, path: current.path });
      }
      return { ok: true, version: versionString(written) };
    } catch (error) {
      if (isConflict(error)) return { ok: false, reason: "conflict" };
      if (statusOf(error) === 403) {
        setState({ status: "no-permission", reason: "revoked" });
      } else if (statusOf(error) === 404) {
        setState({ status: "file-gone" });
      }
      return { ok: false, reason: "failed" };
    }
  };

  const sourceFor = (file: Current): OpenedScoreFile["source"] => ({
    kind: "scoreFile",
    name: file.name,
    version: versionString(file.version),
    save,
    read: async () => {
      const entry = await readEntry();
      return entry ? { text: entry.text, version: versionString(entry.version) } : null;
    },
  });

  return {
    client: options.client,
    async openFile(input) {
      lastSpaceId = input.spaceId;
      setState({ status: "loading" });
      let granted: AuthorizeResult;
      try {
        granted = await options.client.authorize({
          spaceId: input.spaceId,
          scopes: ["file.view", "file.edit"],
          reason: REASONS.open[language],
        });
      } catch {
        setState({ status: "failed" });
        return { ok: false, state: { status: "failed" } };
      }
      if (granted.status !== "granted") {
        const failed: HostFailure = { status: "no-permission", reason: "missing" };
        setState(failed);
        return { ok: false, state: failed };
      }
      const editable = granted.scopes.includes("file.edit");

      let read: ReadFileResult;
      try {
        read = await options.client.read({ spaceId: input.spaceId, path: input.path });
      } catch (error) {
        if (statusOf(error) === 403) {
          const failed: HostFailure = { status: "no-permission", reason: "revoked" };
          setState(failed);
          return { ok: false, state: failed };
        }
        if (statusOf(error) === 404) {
          const failed: HostFailure = { status: "file-gone" };
          setState(failed);
          return { ok: false, state: failed };
        }
        const failed: HostFailure = { status: "failed" };
        setState(failed);
        return { ok: false, state: failed };
      }

      const file: Current = {
        spaceId: input.spaceId,
        path: input.path,
        name: fileNameOf(input.path),
        version: read.version,
        editable,
      };
      current = file;
      setState({ status: "ready", editable, name: file.name, path: file.path });
      return {
        ok: true,
        project: projectFor(file.spaceId, file.path, read.text),
        source: sourceFor(file),
        editable,
        name: file.name,
        path: file.path,
      };
    },
    async requestAccess() {
      const spaceId = current?.spaceId ?? lastSpaceId;
      if (spaceId === null) return "denied";
      const editOnly = current !== null && !current.editable;
      const scopes = editOnly ? ["file.edit"] : ["file.view", "file.edit"];
      let granted: AuthorizeResult;
      try {
        granted = await options.client.authorize({
          spaceId,
          scopes,
          reason: editOnly ? REASONS.edit[language] : REASONS.open[language],
        });
      } catch {
        return "denied";
      }
      if (granted.status !== "granted") return granted.status;
      if (current !== null) {
        current = { ...current, editable: granted.scopes.includes("file.edit") };
        setState({
          status: "ready",
          editable: current.editable,
          name: current.name,
          path: current.path,
        });
      }
      return "granted";
    },
    relaunch(input) {
      if (!current) return "other";
      if (current.spaceId !== input.spaceId) return "other";
      if (current.path === input.path) return "same";
      current = { ...current, path: input.path, name: fileNameOf(input.path) };
      setState({ status: "ready", editable: current.editable, name: current.name, path: current.path });
      return "moved";
    },
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setLanguage(next) {
      language = next;
    },
    armCreateOnNextSave() {
      createOnNextSave = true;
    },
    disarmCreateOnNextSave() {
      createOnNextSave = false;
    },
    allowClose(unsaved) {
      return !unsaved;
    },
    name: () => current?.name ?? null,
    path: () => current?.path ?? null,
    editable: () => current?.editable ?? false,
  };
}
