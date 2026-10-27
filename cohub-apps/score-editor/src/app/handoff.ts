import {
  checkProject,
  type Diagnostic,
  type DialectRegistry,
  type HandoffPayload,
} from "@neta-art/score-editor";
import { statusOf, type CohubAppClient, type FileVersion } from "../host/host.ts";
import { fillCopy, frameCopy, type Language } from "./copy.ts";

/** Where a generated score's handoff goes: the same folder as its draft, named after the task run. */
export const DRAFT_DIR = ".cohub/score-drafts";

export function draftScorePath(taskRunId: string): string {
  return `${DRAFT_DIR}/${taskRunId}.abc`;
}

export type HandoffTarget =
  | { readonly kind: "scoreFile"; readonly path: string }
  | { readonly kind: "generated"; readonly taskRunId: string };

export type HandoffRequest = {
  readonly spaceId: string;
  readonly target: HandoffTarget;
  readonly title: string;
  readonly language: Language;
  readonly payload: HandoffPayload;
};

export type HandoffOutcome =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: "check"; readonly problem: Diagnostic | null }
  | { readonly ok: false; readonly reason: "failed" };

/** The dialect check and the package's pre-handoff review, on the project about to be handed off. */
function review(
  payload: HandoffPayload,
  dialects: DialectRegistry,
): { readonly blocked: boolean; readonly problem: Diagnostic | null } {
  const dialect = dialects.find(payload.project.modelId);
  if (!dialect) return { blocked: false, problem: null };
  const parsed = dialect.parse(payload.project.score);
  if (parsed.score === null) return { blocked: true, problem: parsed.diagnostics[0] ?? null };
  const notice = checkProject(dialect, payload.project)[0] ?? null;
  return { blocked: notice !== null, problem: notice };
}

/**
 * The App's half of the handoff. The package saves a score file (a conflict stops it) and calls the host only when
 * the score may go; a generated score's draft keeper has recorded the handoff hash by then. The checks run before
 * anything is written or chipped, then this module writes the file a generated score needs and puts the
 * agent-facing chip on the composer.
 */
export function createHandoff(options: { readonly client: CohubAppClient; readonly dialects: DialectRegistry }) {
  const { client } = options;
  let key: string | null = null;
  let handedOff = 0;

  return {
    async run(request: HandoffRequest): Promise<HandoffOutcome> {
      const { spaceId, payload } = request;
      const checked = review(payload, options.dialects);
      if (checked.blocked) return { ok: false, reason: "check", problem: checked.problem };
      let path: string;
      if (request.target.kind === "generated") {
        path = draftScorePath(request.target.taskRunId);
        let expected: FileVersion | null = null;
        try {
          expected = (await client.read({ spaceId, path })).version;
        } catch (error) {
          if (statusOf(error) !== 404) return { ok: false, reason: "failed" };
        }
        try {
          await client.write({ spaceId, path, text: payload.attachment.text, expected });
        } catch {
          return { ok: false, reason: "failed" };
        }
      } else {
        path = request.target.path;
      }

      const nextKey = `score-handoff:${handedOff + 1}`;
      const content = `${fillCopy(frameCopy(request.language).chipPath, { path })}\n\n${payload.instruction}`;
      try {
        client.setComposerChip({ key: nextKey, label: request.title, content });
      } catch {
        return { ok: false, reason: "failed" };
      }
      key = nextKey;
      handedOff += 1;
      return { ok: true, path };
    },
    /** Takes the chip back when the file it names is no longer the file in this window. */
    clear(): void {
      if (key === null) return;
      client.clearComposerChip(key);
      key = null;
    },
  };
}
