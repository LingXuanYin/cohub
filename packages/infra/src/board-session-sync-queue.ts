import { BOARD_SESSION_SYNC_JOB, type BoardSessionSyncJobData } from "@cohub/protocol";
import { COHUB_SYSTEM_QUEUE, createBullmqQueue, defaultJobRetention } from "./bullmq/index.js";
import { createLogger } from "./logging/index.js";
import { injectTrace } from "./tracing/propagator.js";

export const BOARD_SESSION_SYNC_DELAY_MS = 2 * 60 * 1000;

export function createBoardSessionSyncEnqueuer(input: {
  redisUrl: string;
  telemetryServiceName: string;
  shown: (sessionId: string) => Promise<boolean>;
}) {
  const queue = createBullmqQueue<BoardSessionSyncJobData>(COHUB_SYSTEM_QUEUE, {
    redisUrl: input.redisUrl,
    telemetryServiceName: input.telemetryServiceName,
  });
  const logger = createLogger({ serviceName: input.telemetryServiceName });
  return async (sessionId: string) => {
    try {
      if (!(await input.shown(sessionId))) return;
      await queue.add(
        BOARD_SESSION_SYNC_JOB,
        { sessionId, trace: injectTrace() },
        {
          delay: BOARD_SESSION_SYNC_DELAY_MS,
          deduplication: { id: `board-session-sync-${sessionId}`, keepLastIfActive: true },
          attempts: 3,
          backoff: { type: "exponential", delay: 5_000 },
          ...defaultJobRetention,
          removeOnComplete: true,
        },
      );
    } catch (error) {
      logger.warn("[BoardSessions] failed to schedule a sync", { sessionId, error });
    }
  };
}
