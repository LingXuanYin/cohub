import { createTurnReplyEnqueuer } from "@cohub/infra/session-turn-reply-queue";
import { config } from "./config.js";

export const deliverTurnReplyLater = createTurnReplyEnqueuer({
  redisUrl: config.bullmqRedisUrl,
  telemetryServiceName: "cohub-api-turn-reply",
});
