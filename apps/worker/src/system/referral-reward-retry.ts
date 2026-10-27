import { billingOperations } from "@cohub/billing";
import {
  expireReferralClaims,
  retryQualifiedReferralRewards,
  startReferralRewardRetryLoop,
} from "@cohub/core/referrals";
import { createLogger } from "@cohub/infra/logging";
import { db } from "../db.js";

const logger = createLogger({ serviceName: "cohub-worker" });

export function startSystemReferralRewardRetryLoop(intervalMs = 60_000) {
  const loopLogger = {
    info: (message: string, meta?: Record<string, unknown>) => logger.info(message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => logger.warn(message, meta),
  };
  return startReferralRewardRetryLoop({
    intervalMs,
    logger: loopLogger,
    run: async () => {
      const expired = await expireReferralClaims(db);
      if (!billingOperations.status.configured) return { expired };
      const result = await retryQualifiedReferralRewards({
        db,
        billing: billingOperations,
        logger: loopLogger,
      });
      return { ...result, expired };
    },
  });
}
