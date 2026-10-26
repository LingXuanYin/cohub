import type { CohubClient, Permission } from "@neta-art/cohub";
import type { CohubFileClient } from "./host.ts";

/** Wraps the published App's SDK calls into the small shape the host module uses. */
export function createSdkFileClient(client: CohubClient): CohubFileClient {
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
      return { status: result.status };
    },
    async read({ spaceId, path }) {
      const file = await client.space(spaceId).files.read(path);
      if (!("content" in file)) {
        // A file the server is still preparing has no text yet; read it again from the file's own UI.
        throw Object.assign(new Error("The file is being prepared."), { status: 503 });
      }
      return { text: file.content, version: { mtimeMs: file.mtimeMs, size: file.size } };
    },
    async write({ spaceId, path, text, expected }) {
      const written = await client.space(spaceId).files.write({
        path,
        content: text,
        encoding: "utf-8",
        expected: { mtimeMs: expected.mtimeMs, size: expected.size },
      });
      return { mtimeMs: written.mtimeMs, size: written.size };
    },
  };
}
