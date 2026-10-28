import { createSessionSnapshotScheduler, publishSessionSnapshot } from "@cohub/core/sessions";
import { syncSessionBoardsLater } from "./board-session-sync.js";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { publishRealtimeEnvelope } from "./redis.js";

export const scheduleSessionSnapshot = createSessionSnapshotScheduler(
  async (sessionId, fromSequence) => {
    await publishSessionSnapshot(db, sessionId, publishRealtimeEnvelope, fromSequence);
    void syncSessionBoardsLater(sessionId);
  },
  (error, sessionId) => logger.warn("[Realtime] failed to publish session snapshot", { sessionId, error }),
);
