import type { AuthorizeResult, CohubFileClient, FileVersion, ReadFileResult } from "../src/host/host.ts";

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
  | { kind: "write"; spaceId: string; path: string; text: string; expected: FileVersion | null };

export type FakeClient = CohubFileClient & {
  readonly calls: FakeCall[];
  readonly writes: Array<{ spaceId: string; path: string; text: string; expected: FileVersion | null }>;
  fileAt(path: string): { text: string; version: FileVersion } | null;
  setFile(path: string, text: string, version?: FileVersion): void;
  deleteFile(path: string): void;
  /** What the viewer holds on the Space; a grant is limited to it. */
  grant(scopes: readonly string[]): void;
  cancelAuthorize(): void;
  /** The viewer revokes the App's grant; the next `authorize` asks again. */
  revoke(): void;
  failNextWrite(error: Error): void;
  failNextRead(error: Error): void;
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
  /** A read that never settles, for the loading state. */
  neverResolveRead?: boolean;
} = {}): FakeClient {
  const files = new Map<string, FakeFile>();
  let clock = options.clock ?? 1_000;
  let viewerScopes = [...(options.scopes ?? ["file.view", "file.edit"])];
  let grant: string[] | null = null;
  let authorizeMode = options.authorize ?? "granted";
  const authorizeSteps = [...(options.authorizeSteps ?? [])];
  let nextWriteError: Error | null = null;
  let nextReadError: Error | null = null;
  let afterRead = options.afterRead ?? null;
  let afterWriteError = options.afterWriteError ?? null;
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

  const requirePermission = (scope: "file.view" | "file.edit") => {
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
    async read(input): Promise<ReadFileResult> {
      calls.push({ kind: "read", spaceId: input.spaceId, path: input.path });
      requirePermission("file.view");
      if (nextReadError) {
        const error = nextReadError;
        nextReadError = null;
        throw error;
      }
      const file = files.get(input.path);
      if (!file) throw new FakeRequestError(404);
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
        const file = files.get(input.path);
        if (input.expected === null) {
          clock += 1_000;
          const version = { mtimeMs: clock, size: new TextEncoder().encode(input.text).length };
          files.set(input.path, { text: input.text, version });
          return { ...version };
        }
        if (!file) throw new FakeRequestError(404);
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
    reads() {
      return calls.filter((call) => call.kind === "read").length;
    },
    writesTo(path) {
      return calls.filter((call) => call.kind === "write" && call.path === path).length;
    },
  };
  return client;
}
