import type {
  Permission,
  SpaceFsFileResponse,
  SpaceFsPreparingFile,
  SpaceFsWriteFileInput,
} from "@neta-art/cohub";
import type { CohubFileClient, FileVersion } from "./host.ts";
import type { TaskRunSnapshot } from "./task.ts";

/** The authorization answer the SDK gives, narrowed to the fields this App reads. */
type SdkAuthorizeResult =
  | { readonly status: "granted"; readonly grant: { readonly scopes: readonly string[] } }
  | { readonly status: "cancelled" }
  | { readonly status: "denied"; readonly code?: string };

/** The part of the published-App SDK this file uses; a test can stand in for it. */
export type SdkFileSource = {
  readonly auth: {
    authorize(input: {
      readonly target: { readonly kind: "space"; readonly spaceId: string };
      readonly scopes: Permission[];
      readonly reason?: string;
    }): Promise<SdkAuthorizeResult>;
  };
  space(spaceId: string): {
    readonly files: {
      read(
        path: string,
        customFetch?: typeof fetch,
        signal?: AbortSignal,
      ): Promise<SpaceFsFileResponse | SpaceFsPreparingFile>;
      list(path: string): Promise<{
        readonly entries: ReadonlyArray<{
          readonly name: string;
          readonly path: string;
          readonly type: "file" | "dir" | "symlink";
        }>;
      }>;
      write(input: SpaceFsWriteFileInput): Promise<{ readonly mtimeMs: number; readonly size: number }>;
      delete(path: string): Promise<unknown>;
    };
  };
  readonly tasks: {
    get(taskRunId: string): Promise<{ readonly run: TaskRunSnapshot }>;
  };
};

type FetchLike = typeof fetch;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

/** A prepared file's bytes, as UTF-8 text. Invalid UTF-8 throws, which the host shows as a failed read. */
async function textOf(file: SpaceFsFileResponse, doFetch: FetchLike): Promise<string> {
  if (file.delivery === "url" && file.url) {
    const response = await doFetch(file.url);
    if (!response.ok) {
      throw Object.assign(new Error(`The score file could not be downloaded (${response.status}).`), {
        status: response.status,
      });
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(await response.arrayBuffer());
  }
  if (file.encoding === "base64") {
    const binary = atob(file.content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  return file.content;
}

function fileVersion(version: { mtimeMs: number; size: number }): FileVersion {
  return { mtimeMs: version.mtimeMs, size: version.size };
}

/** Wraps the published App's SDK calls into the small shape the host module uses. */
export function createSdkFileClient(
  client: SdkFileSource,
  options: { readonly fetch?: FetchLike } = {},
): CohubFileClient {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  return {
    async authorize({ spaceId, scopes, reason }) {
      const result = await client.auth.authorize({
        target: { kind: "space", spaceId },
        scopes: [...scopes] as Permission[],
        reason,
      });
      if (result.status === "granted") {
        return { status: "granted", scopes: [...result.grant.scopes] };
      }
      return result.status === "denied"
        ? { status: "denied", ...(result.code === undefined ? {} : { code: result.code }) }
        : { status: result.status };
    },
    async read({ spaceId, path }) {
      for (;;) {
        const file = await client.space(spaceId).files.read(path);
        // A file the host is still preparing has no text yet; wait its own delay and ask again.
        if (!("content" in file)) {
          await wait(file.retryAfterMs);
          continue;
        }
        return { text: await textOf(file, doFetch), version: fileVersion(file) };
      }
    },
    async list({ spaceId, path }) {
      const tree = await client.space(spaceId).files.list(path);
      return tree.entries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        type: entry.type,
      }));
    },
    async write({ spaceId, path, text, expected }) {
      const written = await client.space(spaceId).files.write({
        path,
        content: text,
        encoding: "utf-8",
        ...(expected === null ? {} : { expected: { mtimeMs: expected.mtimeMs, size: expected.size } }),
      });
      return fileVersion(written);
    },
    async delete({ spaceId, path }) {
      await client.space(spaceId).files.delete(path);
    },
    async getTask(taskRunId) {
      const detail = await client.tasks.get(taskRunId);
      return detail.run;
    },
  };
}
