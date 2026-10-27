import type {
  AuthorizeResult,
  CohubFileClient,
  FileEntry,
  FileVersion,
  ReadFileResult,
} from "../src/host/host.ts";
import type { TaskRunSnapshot } from "../src/host/task.ts";

export class FakeRequestError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null = null) {
    super(code ?? `HTTP ${status}`);
    this.name = "FakeRequestError";
    this.status = status;
    this.code = code;
  }
}

type FakeFile = { text: string; version: FileVersion };

export type FakeCall =
  | { kind: "authorize"; spaceId: string; scopes: readonly string[]; reason: string | null }
  | { kind: "read"; spaceId: string; path: string }
  | { kind: "write"; spaceId: string; path: string; text: string; expected: FileVersion | null }
  | { kind: "list"; spaceId: string; path: string }
  | { kind: "delete"; spaceId: string; path: string }
  | { kind: "task"; taskRunId: string };

export type FakeClient = CohubFileClient & {
  readonly calls: FakeCall[];
  readonly writes: Array<{ spaceId: string; path: string; text: string; expected: FileVersion | null }>;
  fileAt(path: string): { text: string; version: FileVersion } | null;
  setFile(path: string, text: string, version?: FileVersion): void;
  deleteFile(path: string): void;
  setTask(task: TaskRunSnapshot): void;
  taskAt(taskRunId: string): TaskRunSnapshot | null;
  /** What the viewer holds on the Space; a grant is limited to it. */
  grant(scopes: readonly string[]): void;
  cancelAuthorize(): void;
  /** The viewer revokes the App's grant; the next `authorize` asks again. */
  revoke(): void;
  failNextWrite(error: Error): void;
  failNextRead(error: Error): void;
  failNextList(error: Error): void;
  reads(): number;
  writesTo(path: string): number;
};

/**
 * A cohub consent model, not a canned answer list: the viewer holds scopes on the Space, a granted
 * answer gives the requested scopes the viewer holds, later calls inside that grant answer granted
 * without a dialog, and a revoke drops the grant.
 */
export function createFakeClient(options: {
  files?: Record<string, string>;
  scopes?: readonly string[];
  authorize?: "granted" | "cancelled" | "denied";
  /** The viewer's answer when the dialog is shown; one per dialog, then `authorize`. */
  authorizeSteps?: Array<"granted" | "cancelled" | "denied">;
  clock?: number;
  /** Runs once, after the first read answers, to stage a later writer or a failure. */
  afterRead?: () => void;
  /** Runs once, after a write fails, to stage a file that came back meanwhile. */
  afterWriteError?: () => void;
  /** Runs once, after a read finds no file, to stage the file coming back between reads. */
  afterReadError?: () => void;
  /** A read that never settles, for the loading state. */
  neverResolveRead?: boolean;
  /** Task Runs by id, for a generated score. */
  tasks?: Record<string, TaskRunSnapshot>;
} = {}): FakeClient {
  const files = new Map<string, FakeFile>();
  const tasks = new Map<string, TaskRunSnapshot>(Object.entries(options.tasks ?? {}));
  let clock = options.clock ?? 1_000;
  let viewerScopes = [...(options.scopes ?? ["file.view", "file.edit", "taskrun.view"])];
  let grant: string[] | null = null;
  let authorizeMode = options.authorize ?? "granted";
  const authorizeSteps = [...(options.authorizeSteps ?? [])];
  let nextWriteError: Error | null = null;
  let nextReadError: Error | null = null;
  let nextListError: Error | null = null;
  let afterRead = options.afterRead ?? null;
  let afterWriteError = options.afterWriteError ?? null;
  let afterReadError = options.afterReadError ?? null;
  let neverResolveRead = options.neverResolveRead === true;
  const calls: FakeCall[] = [];

  const put = (path: string, text: string, version?: FileVersion) => {
    clock += 1_000;
    files.set(path, {
      text,
      version: version ?? { mtimeMs: clock, size: new TextEncoder().encode(text).length },
    });
  };
  for (const [path, text] of Object.entries(options.files ?? {})) put(path, text);

  const requirePermission = (scope: "file.view" | "file.edit" | "taskrun.view") => {
    if (!grant?.includes(scope)) throw new FakeRequestError(403);
  };

  const client: FakeClient = {
    calls,
    get writes() {
      return calls.filter((call): call is Extract<FakeCall, { kind: "write" }> => call.kind === "write");
    },
    async authorize(input): Promise<AuthorizeResult> {
      calls.push({ kind: "authorize", spaceId: input.spaceId, scopes: input.scopes, reason: input.reason });
      const requested = [...input.scopes];
      const current = grant;
      if (current !== null && requested.every((scope) => current.includes(scope))) {
        return { status: "granted", scopes: [...current] };
      }
      const answer = authorizeSteps.shift() ?? authorizeMode;
      if (answer === "cancelled") return { status: "cancelled" };
      if (answer === "denied") return { status: "denied" };
      const next = new Set(current ?? []);
      for (const scope of requested) {
        if (viewerScopes.includes(scope)) next.add(scope);
      }
      grant = [...next];
      return { status: "granted", scopes: [...grant] };
    },
    async getTask(taskRunId: string): Promise<TaskRunSnapshot> {
      calls.push({ kind: "task", taskRunId });
      requirePermission("taskrun.view");
      const task = tasks.get(taskRunId);
      if (!task) throw new FakeRequestError(404);
      return task;
    },
    async list(input): Promise<readonly FileEntry[]> {
      calls.push({ kind: "list", spaceId: input.spaceId, path: input.path });
      requirePermission("file.view");
      if (nextListError) {
        const error = nextListError;
        nextListError = null;
        throw error;
      }
      const prefix = input.path ? `${input.path.replace(/\/+$/, "")}/` : "";
      const entries: FileEntry[] = [];
      for (const path of files.keys()) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        if (rest.includes("/")) continue;
        entries.push({ name: rest, path, type: "file" });
      }
      if (entries.length === 0) throw new FakeRequestError(404);
      return entries;
    },
    async delete(input): Promise<void> {
      calls.push({ kind: "delete", spaceId: input.spaceId, path: input.path });
      requirePermission("file.edit");
      if (!files.has(input.path)) throw new FakeRequestError(404);
      files.delete(input.path);
    },
    async read(input): Promise<ReadFileResult> {
      calls.push({ kind: "read", spaceId: input.spaceId, path: input.path });
      requirePermission("file.view");
      if (nextReadError) {
        const error = nextReadError;
        nextReadError = null;
        throw error;
      }
      const file = files.get(input.path);
      if (!file) {
        if (afterReadError) {
          const run = afterReadError;
          afterReadError = null;
          run();
        }
        throw new FakeRequestError(404, "path_not_found");
      }
      const answer = { text: file.text, version: { ...file.version } };
      if (afterRead) {
        const run = afterRead;
        afterRead = null;
        run();
      }
      if (neverResolveRead) return new Promise<ReadFileResult>(() => {});
      return answer;
    },
    async write(input): Promise<FileVersion> {
      calls.push({
        kind: "write",
        spaceId: input.spaceId,
        path: input.path,
        text: input.text,
        expected: input.expected ? { ...input.expected } : null,
      });
      try {
        requirePermission("file.edit");
        if (nextWriteError) {
          const error = nextWriteError;
          nextWriteError = null;
          throw error;
        }
        // cohub's versioned write checks the file first, and a missing file is a conflict, not a 404:
        // apps/api/src/space-fs.ts `writeSpaceFile` throws SpaceFsError(409, "file_conflict") when the
        // stat fails, and apps/api/src/space-fs-remote.ts `writeSpaceFile` does the same through fs.stat.
        // A read of a missing path is the 404 `path_not_found` those files throw.
        const file = files.get(input.path);
        if (input.expected === null) {
          clock += 1_000;
          const version = { mtimeMs: clock, size: new TextEncoder().encode(input.text).length };
          files.set(input.path, { text: input.text, version });
          return { ...version };
        }
        if (!file) throw new FakeRequestError(409, "file_conflict");
        const sameVersion =
          file.version.mtimeMs === input.expected.mtimeMs && file.version.size === input.expected.size;
        if (!sameVersion) throw new FakeRequestError(409, "file_conflict");
        clock += 1_000;
        const version = { mtimeMs: clock, size: new TextEncoder().encode(input.text).length };
        files.set(input.path, { text: input.text, version });
        return { ...version };
      } catch (error) {
        if (afterWriteError) {
          const run = afterWriteError;
          afterWriteError = null;
          run();
        }
        throw error;
      }
    },
    fileAt(path) {
      const file = files.get(path);
      return file ? { text: file.text, version: { ...file.version } } : null;
    },
    setFile(path, text, version) {
      put(path, text, version);
    },
    deleteFile(path) {
      files.delete(path);
    },
    setTask(task) {
      tasks.set(task.id, task);
    },
    taskAt(taskRunId) {
      return tasks.get(taskRunId) ?? null;
    },
    grant(next) {
      viewerScopes = [...next];
    },
    cancelAuthorize() {
      authorizeMode = "cancelled";
    },
    revoke() {
      grant = null;
    },
    failNextWrite(error) {
      nextWriteError = error;
    },
    failNextRead(error) {
      nextReadError = error;
    },
    failNextList(error) {
      nextListError = error;
    },
    reads() {
      return calls.filter((call) => call.kind === "read").length;
    },
    writesTo(path) {
      return calls.filter((call) => call.kind === "write" && call.path === path).length;
    },
  };
  return client;
}
