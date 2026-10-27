import { requestAgentTurnAbort as requestAbort } from "@cohub/core/sessions";
import { redisCommandClient } from "./redis.js";

export const requestAgentTurnAbort = (input: Parameters<typeof requestAbort>[1]) => requestAbort(redisCommandClient, input);
