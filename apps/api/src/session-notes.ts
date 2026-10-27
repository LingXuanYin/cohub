import type { ContentBlock } from "@cohub/protocol/core";
import { createSessionNoteTurn } from "./session-turns.js";
import { persistMessageNode } from "./space-sessions.js";

export async function recordSessionNote(input: {
  spaceId: string;
  sessionId: string;
  userId: string;
  clientMessageId: string;
  content: ContentBlock[];
  meta?: Record<string, unknown>;
}) {
  const turn = await createSessionNoteTurn({
    sessionId: input.sessionId,
    userUuid: input.userId,
    userContent: input.content,
    clientMessageId: input.clientMessageId,
    meta: input.meta,
  });
  const messageId = typeof turn.meta?.userMessageId === "string" ? turn.meta.userMessageId : undefined;
  await persistMessageNode({
    spaceId: input.spaceId,
    sessionId: input.sessionId,
    userId: input.userId,
    idempotencyKey: `note:${turn.id}`,
    message: {
      id: messageId,
      role: "user",
      content: turn.userContent,
      meta: { turnId: turn.id, messageId, clientMessageId: input.clientMessageId },
    },
  });
  return turn;
}
