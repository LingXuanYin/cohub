import { BillingAccessBlockedError, serializeBillingBlocked, type BillingUsageGate } from "@cohub/billing";
import { requestAgentTurnAbort, type AgentTurnAbortRedis } from "@cohub/core/sessions";
import { sessionTurns } from "@cohub/db";
import { and, eq, inArray, or } from "drizzle-orm";

type Db = typeof import("../../../db.js").db;

export type BillingStopInput = {
  spaceId: string;
  sessionId: string;
  turnId: string;
  userId: string;
  provider: string | null;
  model: string | null;
};

/** Stops the overdrawn payer's active Turns in the Session when the prompt balance gate blocks. */
export async function stopTurnsOnBillingBlock(
  deps: { db: Db; redis: AgentTurnAbortRedis; gate: BillingUsageGate },
  input: BillingStopInput,
): Promise<string[]> {
  const turns = await deps.db
    .select({ id: sessionTurns.id })
    .from(sessionTurns)
    .where(and(
      eq(sessionTurns.sessionId, input.sessionId),
      eq(sessionTurns.executionKind, "agent"),
      inArray(sessionTurns.status, ["running", "queued"]),
      or(eq(sessionTurns.id, input.turnId), eq(sessionTurns.userUuid, input.userId)),
    ));
  if (turns.length === 0) return [];

  const decision = await deps.gate.evaluate({
    userId: input.userId,
    usageKind: "llm.turn",
    source: "agent_llm_call",
    provider: input.provider,
    model: input.model,
    spaceId: input.spaceId,
    sessionId: input.sessionId,
    turnId: input.turnId,
  });
  if (decision.status !== "blocked") return [];

  const { billing } = serializeBillingBlocked(new BillingAccessBlockedError(decision));
  const stopped = await Promise.all(turns.map((turn) => requestAgentTurnAbort(deps.redis, {
    spaceId: input.spaceId,
    sessionId: input.sessionId,
    turnId: turn.id,
    reason: "billing",
    actorUserId: input.userId,
    billing,
  })));
  return turns.filter((_, index) => stopped[index]).map((turn) => turn.id);
}
