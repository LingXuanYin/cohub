import type { ContentBlock } from "./core/content.js";
import { isUuidLike } from "./identifiers.js";

export type SessionTurnReplyMode = "note" | "prompt";

export type SessionTurnReply = { mode: SessionTurnReplyMode };

export type SessionTurnRelay = {
  spaceId: string;
  sessionId?: string;
  error?: { code?: string; message: string };
};

export type SessionTurnReplyStatus = "completed" | "failed" | "interrupted" | "cancelled";

export type ReplyBlockRole = "header" | "status";

export const MAX_REPLY_WAKE_DEPTH = 4;

const REPLY_STATUSES = new Set<string>(["completed", "failed", "interrupted", "cancelled"] satisfies SessionTurnReplyStatus[]);

export const isSessionTurnReplyStatus = (value: unknown): value is SessionTurnReplyStatus =>
  typeof value === "string" && REPLY_STATUSES.has(value);

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export const isSessionTurnReplyMode = (value: unknown): value is SessionTurnReplyMode =>
  value === "note" || value === "prompt";

export const readSessionTurnReply = (meta: unknown): SessionTurnReply | null => {
  const mode = record(record(meta)?.reply)?.mode;
  return isSessionTurnReplyMode(mode) ? { mode } : null;
};

export const readSessionTurnRelay = (meta: unknown): SessionTurnRelay | null => {
  const relay = record(record(meta)?.relay);
  if (!relay || !isUuidLike(relay.spaceId)) return null;
  const error = record(relay.error);
  const message = typeof error?.message === "string" ? error.message : null;
  return {
    spaceId: relay.spaceId,
    ...(isUuidLike(relay.sessionId) ? { sessionId: relay.sessionId } : {}),
    ...(message ? { error: { message, ...(typeof error?.code === "string" ? { code: error.code } : {}) } } : {}),
  };
};

export const readExecutionBatchTurnIds = (meta: unknown): string[] => {
  const ids = record(record(meta)?.executionBatch)?.turnIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
};

/** Claims record an execution batch; `relay.ts` mirrors this in SQL. */
export const failedBeforeRun = (turn: { status: string; meta: unknown }): boolean =>
  turn.status === "failed" && record(turn.meta)?.executionBatch === undefined;

export const needsTurnReplyDelivery = (turn: { status: string; meta: unknown }): boolean =>
  isSessionTurnReplyStatus(turn.status)
  && (readSessionTurnReply(turn.meta) !== null || readExecutionBatchTurnIds(turn.meta).length > 1);

export const readReplyBlockRole = (block: ContentBlock): ReplyBlockRole | null => {
  const role = block._meta?.reply;
  return role === "header" || role === "status" ? role : null;
};

export const readReplyStatus = (content: readonly ContentBlock[]): SessionTurnReplyStatus => {
  for (const block of content) {
    const status = readReplyBlockRole(block) === "status" ? block._meta?.status : null;
    if (isSessionTurnReplyStatus(status)) return status;
  }
  return "completed";
};

export type LeadingSpaceMention = {
  spaceId: string;
  sessionId?: string;
  label: string;
  rest: string;
};

const LEADING_SPACE_MENTION = /^\s*@\[([^\]\n]+)\]\(cohub:\/\/spaces\/([^/\s)]+)(?:\/sessions\/([^/\s)]+))?\)/;

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const splitLeadingSpaceMention = (text: string): LeadingSpaceMention | null => {
  const match = LEADING_SPACE_MENTION.exec(text);
  if (!match) return null;
  const spaceId = safeDecode(match[2] ?? "");
  const sessionId = match[3] ? safeDecode(match[3]) : undefined;
  if (!isUuidLike(spaceId) || (sessionId !== undefined && !isUuidLike(sessionId))) return null;
  return {
    spaceId,
    ...(sessionId ? { sessionId } : {}),
    label: (match[1] ?? "").trim(),
    rest: text.slice(match[0].length).replace(/^\s+/, ""),
  };
};

export const stripRelayMention = (content: readonly ContentBlock[], spaceId: string): ContentBlock[] | null => {
  const [first, ...rest] = content;
  if (first?.type !== "text") return null;
  const leading = splitLeadingSpaceMention(first.text);
  if (leading?.spaceId !== spaceId) return null;
  const { mentions, ...meta } = first._meta ?? {};
  const kept = Array.isArray(mentions) ? mentions.filter((mention) => record(mention)?.spaceId !== spaceId) : [];
  const nextMeta = kept.length ? { ...meta, mentions: kept } : meta;
  const forwarded: ContentBlock[] = [
    ...(leading.rest ? [{ type: "text" as const, text: leading.rest, ...(Object.keys(nextMeta).length ? { _meta: nextMeta } : {}) }] : []),
    ...rest,
  ];
  return forwarded.length > 0 ? forwarded : null;
};

export const formatSpaceMention = (input: { spaceId: string; sessionId?: string | null; label: string }): string => {
  const label = input.label.replace(/[[\]\\]/g, "").replace(/\s+/g, " ").trim() || `space:${input.spaceId.slice(0, 8)}`;
  const uri = `cohub://spaces/${encodeURIComponent(input.spaceId)}${input.sessionId ? `/sessions/${encodeURIComponent(input.sessionId)}` : ""}`;
  return `@[${label}](${uri})`;
};
