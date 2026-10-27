import type { BillingPayload } from "./billing.js";

/** Every Turn stop request is published here. */
export const AGENT_TURN_ABORT_CHANNEL = "pubsub:agent:turn_abort";
export const AGENT_TURN_ABORT_TTL_SECONDS = 60 * 60;
export const agentTurnAbortKey = (turnId: string) => `agent:turn:${turnId}:abort`;

/** `billing` lets the running LLM round finish and stops the Turn before the next one. */
export type AgentTurnAbortReason = "abort" | "interrupt" | "billing";

export type AgentTurnAbortEvent = {
  id: string;
  spaceId: string;
  sessionId: string;
  turnId: string;
  reason: AgentTurnAbortReason;
  continuedByTurnId?: string | null;
  actorUserId?: string | null;
  billing?: BillingPayload | null;
  timestamp: number;
};
