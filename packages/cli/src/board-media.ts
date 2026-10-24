import { resolve } from "node:path";
import {
  type BoardDocument,
  type BoardItem,
  type BoardMediaFileResolver,
  diffMergePatch,
  mergePatch,
  parseBoardItem,
  settleBoardMediaSizes,
} from "@neta-art/cohub/board";
import { createClient } from "./client.js";
import { localMediaFacts } from "./local-media.js";
import { WORKSPACE_ROOT } from "./space-files/operands.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function boardMediaFileResolver(spaceId: string): BoardMediaFileResolver {
  const local = process.env.COHUB_SPACE_ID === spaceId;
  return async (path, type, signal) => {
    const file = resolve(WORKSPACE_ROOT, path);
    const facts = local && file.startsWith(`${WORKSPACE_ROOT}/`) ? await localMediaFacts(file, type, signal) : null;
    return facts ? { width: facts.width, height: facts.height } : createClient().space(spaceId).files.resolveUrl(path, { purpose: "playback", signal }).catch(() => null);
  };
}

export async function settleBoardDocument(spaceId: string, document: BoardDocument): Promise<BoardDocument> {
  const settled = await settleBoardMediaSizes(document.items, { resolveFile: boardMediaFileResolver(spaceId) });
  return Object.keys(settled).length ? { ...document, items: { ...document.items, ...settled } } : document;
}

export async function settleBoardPatch<T extends Record<string, unknown>>(
  spaceId: string,
  patch: T,
  current: (ids: string[]) => Promise<Record<string, unknown> | null>,
): Promise<T> {
  const items = isRecord(patch.items) ? patch.items : {};
  const created: Record<string, BoardItem> = {};
  for (const [id, value] of Object.entries(items)) {
    if (!isRecord(value) || (value.type !== "image" && value.type !== "video")) continue;
    const parsed = parseBoardItem(value, `items.${id}`);
    if (parsed.ok) created[id] = parsed.item;
  }
  const existing = Object.keys(created).length ? await current(Object.keys(created)) : null;
  if (!existing) return patch;
  for (const [id, item] of Object.entries(existing)) {
    if (isRecord(item) && item.type === created[id]?.type) delete created[id];
  }
  const settled = await settleBoardMediaSizes(created, { resolveFile: boardMediaFileResolver(spaceId) });
  if (!Object.keys(settled).length) return patch;
  const adopted = Object.entries(settled).map(([id, item]) => [id, mergePatch(items[id], diffMergePatch(created[id], item))]);
  return { ...patch, items: { ...items, ...Object.fromEntries(adopted) } };
}
