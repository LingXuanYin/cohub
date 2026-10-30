import type { ContentBlock } from "@cohub/protocol/core";
import { getSessionDomainServices } from "./session-services.js";

export const recordSessionNote = (input: {
  spaceId: string;
  sessionId: string;
  userId: string;
  clientMessageId: string;
  content: ContentBlock[];
  meta?: Record<string, unknown>;
}) => getSessionDomainServices().recordNote({
  sessionId: input.sessionId,
  userUuid: input.userId,
  content: input.content,
  clientMessageId: input.clientMessageId,
  meta: input.meta,
});
