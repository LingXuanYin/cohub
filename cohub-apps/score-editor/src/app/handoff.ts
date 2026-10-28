import {
  APP_COMPOSER_CHIP_CONTENT_MAX_BYTES,
  APP_COMPOSER_CHIP_LABEL_MAX_LENGTH,
} from "@neta-art/cohub";
import type { Diagnostic, DialectRegistry, HandoffPayload } from "@neta-art/score-editor";
import { DRAFT_DIR } from "../host/drafts.ts";
import { statusOf, type CohubAppClient, type FileVersion } from "../host/host.ts";
import { fillCopy, frameCopy, type Language } from "./copy.ts";

/** Where a generated score's handoff goes: the same folder as its draft, named after the task run. */
export function draftScorePath(taskRunId: string): string {
  return `${DRAFT_DIR}/${taskRunId}.abc`;
}

/**
 * The one path a handoff names: the chip's first line and the instruction's `--text` path both come from here.
 * Null when the handoff cannot know a path (no task id, or no open file).
 */
export function handoffScorePath(input: {
  readonly kind: "scoreFile" | "generated";
  readonly taskRunId: string | null;
  readonly filePath: string | null;
}): string | null {
  if (input.kind === "generated") {
    return input.taskRunId === null ? null : draftScorePath(input.taskRunId);
  }
  return input.filePath;
}

/** A chip label within the protocol's limit, keeping the start and the end of a long name. */
export function fitLabel(label: string): string {
  const text = label.trim();
  if (text.length <= APP_COMPOSER_CHIP_LABEL_MAX_LENGTH) return text;
  const room = APP_COMPOSER_CHIP_LABEL_MAX_LENGTH - 1;
  const head = Math.ceil(room / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - (room - head))}`;
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
  /** Set when the working Space is not the context Space: navigate there after the chip. */
  readonly navigation?: { readonly spaceName: string | null } | null;
};

export type HandoffOutcome =
  | {
      readonly ok: true;
      readonly path: string;
      readonly navigation?: "handled" | "not-handled" | "failed";
    }
  | { readonly ok: false; readonly reason: "check"; readonly problem: Diagnostic | null }
  | { readonly ok: false; readonly reason: "long" }
  | { readonly ok: false; readonly reason: "failed" };

/**
 * The App's part of the checks: the dialect parse. The package's pre-handoff notices are not a gate — it shows them
 * in its own review above an enabled confirm, and the viewer who read them may hand off.
 */
function dialectCheck(
  payload: HandoffPayload,
  dialects: DialectRegistry,
): { readonly blocked: boolean; readonly problem: Diagnostic | null } {
  const dialect = dialects.find(payload.project.modelId);
  if (!dialect) return { blocked: false, problem: null };
  const parsed = dialect.parse(payload.project.score);
  return parsed.score === null
    ? { blocked: true, problem: parsed.diagnostics[0] ?? null }
    : { blocked: false, problem: null };
}

/**
 * The App's half of the handoff. The package saves a score file (a conflict stops it) and calls the host only when
 * the score may go; a generated score's draft keeper has recorded the handoff hash by then. The dialect check runs
 * before anything is written or chipped, then this module writes the file a generated score needs and puts the
 * agent-facing chip on the composer.
 */
export function createHandoff(options: { readonly client: CohubAppClient; readonly dialects: DialectRegistry }) {
  const { client } = options;
  let key: string | null = null;
  let handedOff = 0;

  return {
    async run(request: HandoffRequest): Promise<HandoffOutcome> {
      const { spaceId, payload } = request;
      const checked = dialectCheck(payload, options.dialects);
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
      const copy = frameCopy(request.language);
      const pathLine =
        request.navigation?.spaceName != null
          ? fillCopy(copy.chipPathInSpace, {
              space: request.navigation.spaceName,
              path,
            })
          : fillCopy(copy.chipPath, { path });
      const content = `${pathLine}\n\n${payload.instruction}`;
      const contentBytes = new TextEncoder().encode(content).length;
      try {
        client.setComposerChip({ key: nextKey, label: fitLabel(request.title), content });
      } catch {
        // The protocol refuses content over its limit; the label was fitted, so a throw this size is the content.
        return { ok: false, reason: contentBytes > APP_COMPOSER_CHIP_CONTENT_MAX_BYTES ? "long" : "failed" };
      }
      key = nextKey;
      handedOff += 1;
      if (!request.navigation) return { ok: true, path };
      try {
        const result = await client.navigate({ spaceId, path });
        return { ok: true, path, navigation: result.handled ? "handled" : "not-handled" };
      } catch {
        return { ok: true, path, navigation: "failed" };
      }
    },
    /** Takes the chip back when the file it names is no longer the file in this window. */
    clear(): void {
      if (key === null) return;
      client.clearComposerChip(key);
      key = null;
    },
  };
}
