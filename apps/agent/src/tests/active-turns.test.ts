import assert from "node:assert/strict";
import test from "node:test";
import type { AgentTurnAbortEvent } from "@cohub/protocol";
import { abortActiveTurnAtRoundBoundary, applyRoundBoundaryAbort, clearActiveAbortController, clearActiveAbortEvent, getActiveAbortEvent, setActiveAbortController } from "../active-turns.js";

const billingStop = (turnId: string): AgentTurnAbortEvent => ({ id: `stop-${turnId}`, spaceId: "space", sessionId: "session", turnId, reason: "billing", timestamp: Date.now() });

test("a billing stop waits for the next LLM round of a Turn executing here", (t) => {
  const controller = new AbortController();
  setActiveAbortController("turn-a", controller);
  t.after(() => {
    clearActiveAbortController("turn-a", controller);
    clearActiveAbortEvent("turn-a");
  });

  assert.equal(abortActiveTurnAtRoundBoundary(billingStop("turn-a")), true);
  assert.equal(controller.signal.aborted, false);
  assert.equal(applyRoundBoundaryAbort("turn-a"), true);
  assert.equal(controller.signal.aborted, true);
  assert.equal(getActiveAbortEvent("turn-a")?.reason, "billing");
  assert.equal(applyRoundBoundaryAbort("turn-a"), false);
});
