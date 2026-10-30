import { createTurnReplyEnqueuer } from "@cohub/infra/session-turn-reply-queue";
import { env } from "./env.js";

export const deliverTurnReplyLater = createTurnReplyEnqueuer({
  redisUrl: env.BULLMQ_REDIS_URL,
  telemetryServiceName: "cohub-agent-turn-reply",
});
