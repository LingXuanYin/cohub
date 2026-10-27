import { Redis } from "ioredis";
import { env } from "./env.js";
import { redis } from "./redis.js";
import { createLogger } from "@cohub/infra/logging";
import { AGENT_TURN_ABORT_CHANNEL, agentTurnAbortKey, type AgentTurnAbortEvent } from "@cohub/protocol";

const logger = createLogger({ serviceName: "cohub-agent" });

const subscriber = new Redis(env.REDIS_URL, { disableClientInfo: true });

export async function subscribeAbortEvents(handler: (event: AgentTurnAbortEvent) => void) {
  await subscriber.subscribe(AGENT_TURN_ABORT_CHANNEL);
  subscriber.on("message", (channel, raw) => {
    if (channel !== AGENT_TURN_ABORT_CHANNEL) return;
    try {
      const event = JSON.parse(raw) as AgentTurnAbortEvent;
      if (event?.turnId) handler(event);
    } catch (error) {
      logger.warn("[AgentAbort] invalid abort event", error);
    }
  });
}

export async function getAbortEvent(turnId: string): Promise<AgentTurnAbortEvent | null> {
  const raw = await redis.get(agentTurnAbortKey(turnId)).catch(() => null);
  if (!raw) return null;
  try {
    const event = JSON.parse(raw) as AgentTurnAbortEvent;
    return event?.turnId === turnId ? event : null;
  } catch {
    return null;
  }
}

export async function closeAbortSubscriber() {
  await subscriber.quit();
}
