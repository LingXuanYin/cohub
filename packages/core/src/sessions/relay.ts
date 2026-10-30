import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sessionTurns, spaceSessions } from "@cohub/db";
import type { ContentBlock } from "@cohub/protocol/core";
import {
  readSessionTurnOrigin,
  readSessionTurnRelay,
  splitLeadingSpaceMention,
  stripRelayMention,
  type SessionTurnOrigin,
  type SessionTurnRelay,
} from "@cohub/protocol/model";
import { BillingAccessBlockedError } from "@cohub/billing";
import { hasPermission, type PermissionStore } from "../permissions/index.js";
import { HarnessUnavailableError, ModelUnavailableError, type SubmitSessionPromptInput, type SubmitSessionPromptResult } from "./prompt.js";

type TurnRow = typeof sessionTurns.$inferSelect;
type Database = PostgresJsDatabase<Record<string, unknown>>;

export type RelayTarget = {
  spaceId: string;
  sessionId?: string;
  accessMode: "read_only" | "full_access";
  content: ContentBlock[];
};

const RELAY_ATTEMPT_LEASE = "1 minute";

export class RelayConflictError extends Error {
  readonly code = "relay_conflict";
  constructor() {
    super("clientMessageId was already used for another message");
    this.name = "RelayConflictError";
  }
}

export type RelayDependencies = {
  db: Database;
  permissions: PermissionStore;
  recordNote(input: { sessionId: string; userUuid: string; content: ContentBlock[]; clientMessageId: string; meta?: Record<string, unknown> }): Promise<TurnRow & { created: boolean }>;
  startSession(input: { spaceId: string; userUuid: string; source: string; origin: SessionTurnOrigin }): Promise<string>;
  submit(input: SubmitSessionPromptInput): Promise<SubmitSessionPromptResult>;
  publishTurn(spaceId: string, row: TurnRow): Promise<void>;
  logger: Pick<Console, "warn">;
};

export async function resolveRelayTarget(deps: Pick<RelayDependencies, "db" | "permissions">, input: SubmitSessionPromptInput): Promise<RelayTarget | null> {
  const context = input.context;
  if (input.reply || input.intent === "compact" || context?.kind === "space_hook" || context?.kind === "channel" || (context && "auth" in context && context.auth)) return null;
  const first = input.content[0];
  const leading = first?.type === "text" ? splitLeadingSpaceMention(first.text) : null;
  if (!leading || (leading.spaceId === input.spaceId && (!leading.sessionId || leading.sessionId === input.sessionId))) return null;
  const content = stripRelayMention(input.content, leading.spaceId);
  if (!content) return null;
  if (leading.sessionId) {
    const [session] = await deps.db.select({ spaceId: spaceSessions.spaceId }).from(spaceSessions).where(eq(spaceSessions.id, leading.sessionId)).limit(1);
    if (session?.spaceId !== leading.spaceId) return null;
  }
  const accessMode = await relayAccessMode(deps, input, { spaceId: leading.spaceId, ...(leading.sessionId ? { sessionId: leading.sessionId } : {}) });
  return accessMode ? { spaceId: leading.spaceId, ...(leading.sessionId ? { sessionId: leading.sessionId } : {}), accessMode, content } : null;
}

async function relayAccessMode(
  deps: Pick<RelayDependencies, "permissions">,
  input: Pick<SubmitSessionPromptInput, "userId" | "accessMode">,
  scope: { spaceId: string; sessionId?: string },
) {
  const can = (permission: "session.prompt.readonly" | "session.prompt.fullaccess") =>
    hasPermission({ store: deps.permissions, user: { uuid: input.userId }, permission, context: scope });
  if (input.accessMode !== "read_only" && await can("session.prompt.fullaccess")) return "full_access" as const;
  return await can("session.prompt.readonly") ? "read_only" as const : null;
}

export async function relayPrompt(deps: RelayDependencies, input: SubmitSessionPromptInput, target: RelayTarget): Promise<SubmitSessionPromptResult> {
  const note = await deps.recordNote({
    sessionId: input.sessionId,
    userUuid: input.userId,
    content: input.content,
    clientMessageId: input.clientMessageId,
    meta: {
      source: input.source,
      ...(input.requestSource ? { requestSource: input.requestSource } : {}),
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.sourceClientId ? { sourceClientId: input.sourceClientId } : {}),
      relay: { spaceId: target.spaceId, ...(target.sessionId ? { sessionId: target.sessionId } : {}) },
    },
  });
  const result = { turnId: note.id, userMessageId: String(record(note.meta).userMessageId ?? "") };
  const recorded = readSessionTurnRelay(note.meta);
  if (recorded?.spaceId !== target.spaceId || (target.sessionId && recorded.sessionId !== target.sessionId)) throw new RelayConflictError();
  if (!target.sessionId && recorded.sessionId) {
    const accessMode = await relayAccessMode(deps, input, { spaceId: target.spaceId, sessionId: recorded.sessionId });
    if (!accessMode) throw new RelayConflictError();
    target = { ...target, sessionId: recorded.sessionId, accessMode };
  }
  const claimed = note.created ? note : await claimRetry(deps, note);
  if (claimed) await forward(deps, input, target, claimed);
  return result;
}

async function claimRetry(deps: RelayDependencies, note: TurnRow) {
  const [row] = await deps.db.update(sessionTurns).set({
    meta: sql`${sessionTurns.meta} #- '{relay,error}'`,
    updatedAt: new Date(),
  }).where(and(
    eq(sessionTurns.id, note.id),
    eq(sessionTurns.sessionId, note.sessionId),
    sql`(${sessionTurns.meta}->'relay'->'error' is not null or ${sessionTurns.updatedAt} < now() - ${RELAY_ATTEMPT_LEASE}::interval)`,
  )).returning();
  if (row?.spaceId) await deps.publishTurn(row.spaceId, row);
  return row ?? null;
}

async function setRelay(deps: RelayDependencies, note: TurnRow, relay: SessionTurnRelay) {
  const [row] = await deps.db.update(sessionTurns).set({
    meta: sql`jsonb_set(coalesce(${sessionTurns.meta}, '{}'::jsonb), '{relay}', ${JSON.stringify(relay)}::jsonb, true)`,
    updatedAt: new Date(),
  }).where(and(eq(sessionTurns.id, note.id), eq(sessionTurns.sessionId, note.sessionId))).returning();
  if (row?.spaceId) await deps.publishTurn(row.spaceId, row);
}

function relayError(error: unknown): NonNullable<SessionTurnRelay["error"]> {
  if (error instanceof BillingAccessBlockedError) return { code: "billing", message: error.message };
  if (error instanceof HarnessUnavailableError || error instanceof ModelUnavailableError) return { code: error.code, message: error.message };
  return { code: "relay_failed", message: error instanceof Error ? error.message : String(error) };
}

/** The forwarded Turn, unless it failed before running (`failedBeforeRun`, in SQL). */
async function forwarded(db: Database, sessionId: string, clientMessageId: string) {
  const [turn] = await db.select({ id: sessionTurns.id }).from(sessionTurns).where(and(
    eq(sessionTurns.sessionId, sessionId),
    sql`${sessionTurns.meta}->>'clientMessageId' = ${clientMessageId}`,
    sql`not (${sessionTurns.status} = 'failed' and ${sessionTurns.meta}->'executionBatch' is null)`,
  )).limit(1);
  return Boolean(turn);
}

async function forward(deps: RelayDependencies, input: SubmitSessionPromptInput, target: RelayTarget, note: TurnRow) {
  const clientMessageId = `relay:${note.id}`;
  const origin: SessionTurnOrigin = {
    kind: "prompt",
    spaceId: input.spaceId,
    sessionId: note.sessionId,
    turnId: note.id,
    depth: (readSessionTurnOrigin(note.meta, input.spaceId)?.depth ?? 0) + 1,
  };
  let sessionId = target.sessionId ?? null;
  try {
    if (sessionId && await forwarded(deps.db, sessionId, clientMessageId)) return;
    if (!sessionId) {
      sessionId = await deps.startSession({ spaceId: target.spaceId, userUuid: input.userId, source: input.source, origin });
      // Recorded before sending, so a retry resumes this Chat instead of starting another.
      await setRelay(deps, note, { spaceId: target.spaceId, sessionId });
    }
    const cloud = !input.harness || input.harness === "cohub";
    await deps.submit({
      spaceId: target.spaceId,
      sessionId,
      userId: input.userId,
      clientMessageId,
      content: target.content,
      source: input.source,
      origin,
      reply: { mode: "note" },
      harness: "cohub",
      model: cloud ? input.model ?? null : null,
      provider: cloud ? input.provider ?? null : null,
      thinkingLevel: cloud ? input.thinkingLevel ?? null : null,
      generationPolicy: cloud ? input.generationPolicy ?? null : null,
      accessMode: target.accessMode,
      intent: "followup",
    });
  } catch (error) {
    deps.logger.warn("[Relay] failed to forward note", { noteId: note.id, targetSpaceId: target.spaceId, error });
    await setRelay(deps, note, { spaceId: target.spaceId, ...(sessionId ? { sessionId } : {}), error: relayError(error) })
      .catch((cause) => deps.logger.warn("[Relay] failed to record forward failure", { noteId: note.id, cause }));
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
