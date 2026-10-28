import { boardChangedEvent, syncSessionBoards } from "@cohub/core/board";
import { BOARD_SESSION_SYNC_JOB, type BoardSessionSyncJobData } from "@cohub/protocol";
import { REALTIME_OUTBOUND_CHANNEL } from "@cohub/protocol/realtime";
import type { Job } from "bullmq";
import { db } from "../../../db.js";
import { redisCommandClient } from "../../../redis.js";
import { registerSystemJob } from "../../registry.js";

const SESSION_SOURCE = { via: "session" } as const;
const ACTOR_ID = "system";

registerSystemJob(BOARD_SESSION_SYNC_JOB, async (job: Job) => {
  const { sessionId } = job.data as BoardSessionSyncJobData;
  let failure: unknown = null;
  const writes = await syncSessionBoards(db, {
    sessionId,
    actorId: ACTOR_ID,
    source: SESSION_SOURCE,
    onError: (_boardId, error) => {
      failure ??= error;
    },
  });
  await Promise.all(writes.map(async ({ spaceId, boardId, outcome }) => {
    const event = boardChangedEvent({ spaceId, boardId, actorId: ACTOR_ID, actor: { kind: "user" }, outcome, source: SESSION_SOURCE });
    if (event) await redisCommandClient.publish(REALTIME_OUTBOUND_CHANNEL, JSON.stringify(event));
  }));
  if (failure) throw failure;
  return { sessionId, boards: writes.length };
});
