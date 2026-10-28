import { isSessionOnBoards } from "@cohub/core/board";
import { createBoardSessionSyncEnqueuer } from "@cohub/infra/board-session-sync-queue";
import { config } from "./config.js";
import { db } from "./db/index.js";

export const syncSessionBoardsLater = createBoardSessionSyncEnqueuer({
  redisUrl: config.bullmqRedisUrl,
  telemetryServiceName: "cohub-api-board-session-sync",
  shown: (sessionId) => isSessionOnBoards(db, sessionId),
});
