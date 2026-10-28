import { isSessionOnBoards } from "@cohub/core/board";
import { createBoardSessionSyncEnqueuer } from "@cohub/infra/board-session-sync-queue";
import { db } from "./db.js";
import { env } from "./env.js";

export const syncSessionBoardsLater = createBoardSessionSyncEnqueuer({
  redisUrl: env.BULLMQ_REDIS_URL,
  telemetryServiceName: "cohub-agent-board-session-sync",
  shown: (sessionId) => isSessionOnBoards(db, sessionId),
});
