import { formatDiagnostic, type Diagnostic } from "@neta-art/score-editor";
import type { HostFailure } from "../host/host.ts";
import { fillCopy, frameCopy, type Language } from "./copy.ts";
import type { HandoffOutcome } from "./handoff.ts";

export type FrameStateName = "loading" | "no-file" | "no-host";
export type ScoreKind = "scoreFile" | "generated";
export type FailureAction = "access" | "retry" | "none" | "close";

/** The line the frame keeps after a handoff: ready, or the reason nothing went. */
export type HandoffNotice =
  | { readonly kind: "ready" }
  | { readonly kind: "check"; readonly problem: Diagnostic | null }
  | { readonly kind: "long" }
  | { readonly kind: "failed" };

/** What the frame says about a handoff result; a notice the package showed is not a refusal. */
export function handoffNoticeFor(outcome: HandoffOutcome): HandoffNotice {
  if (outcome.ok) return { kind: "ready" };
  if (outcome.reason === "check") return { kind: "check", problem: outcome.problem };
  return { kind: outcome.reason };
}

/** The handoff line in the host's language. */
export function handoffNoticeText(notice: HandoffNotice, language: Language): string {
  const copy = frameCopy(language);
  if (notice.kind === "ready") return copy.handoffReady;
  if (notice.kind === "long") return copy.handoffTooLong;
  if (notice.kind === "failed") return copy.handoffFailed;
  return notice.problem === null
    ? copy.handoffUnreadable
    : fillCopy(copy.handoffBlocked, { reason: formatDiagnostic(notice.problem, language) });
}

export type StateContent = { readonly title: string; readonly body: string };

export function stateCopy(
  state: FrameStateName,
  name: string | null,
  language: Language,
  kind: ScoreKind = "scoreFile",
): StateContent {
  const copy = frameCopy(language);
  if (state === "loading") {
    const fallback = kind === "generated" ? copy.generatedScoreTag : copy.scoreFileTag;
    return { title: fillCopy(copy.opening, { name: name ?? fallback }), body: "" };
  }
  if (state === "no-file") return { title: copy.noFileTitle, body: copy.noFileBody };
  return { title: copy.noHostTitle, body: copy.noHostBody };
}

export type FailurePresentation = StateContent & {
  /** Unsaved edits keep the editor mounted; without them the state replaces it. */
  readonly keepEditor: boolean;
  readonly action: FailureAction;
};

/** What a host failure looks like in the frame, with the person's unsaved work in mind. */
export function failurePresentation(
  state: HostFailure,
  options: {
    readonly unsaved: boolean;
    readonly name: string;
    readonly language: Language;
    readonly kind?: ScoreKind;
  },
): FailurePresentation {
  const copy = frameCopy(options.language);
  const fill = (template: string) => fillCopy(template, { name: options.name });

  let content: StateContent;
  let action: FailureAction;
  if (state.status === "file-gone") {
    content = { title: fill(copy.goneTitle), body: copy.goneBody };
    // A move arrives as a relaunch, so a file that is gone without one was deleted.
    if (options.unsaved) {
      content = { title: content.title, body: fill(copy.deletedEditsBody) };
      action = "none";
    } else {
      action = "close";
    }
  } else if (state.status === "task-gone") {
    content = { title: copy.taskGoneTitle, body: "" };
    action = "close";
  } else if (state.status === "failed") {
    content = { title: fill(copy.failedTitle), body: copy.failedBody };
    if (options.unsaved) {
      content = { title: content.title, body: fill(copy.checkFailedBody) };
      action = "none";
    } else {
      action = "retry";
    }
  } else {
    content = {
      title: fill(state.reason === "revoked" ? copy.revokedTitle : copy.noPermissionTitle),
      body:
        state.reason === "revoked"
          ? copy.revokedBody
          : options.kind === "generated"
            ? copy.generatedNoPermissionBody
            : copy.noPermissionBody,
    };
    action = "access";
    if (options.unsaved) {
      content = {
        title: content.title,
        body: fill(state.reason === "revoked" ? copy.revokedEditsBody : copy.needsAccessEditsBody),
      };
    }
  }

  if (!options.unsaved) return { ...content, keepEditor: false, action };
  return { title: content.title, body: content.body, keepEditor: true, action };
}

export type EditorNotice = { readonly text: string; readonly action: "edit" };

/**
 * The line above the editor: kept edits that cannot be saved ask for edit access; a read-only file
 * with nothing unsaved explains why; anything else has no line.
 */
export function editorNotice(options: {
  readonly unsaved: boolean;
  readonly editable: boolean;
  readonly message: string | null;
  readonly name: string;
  readonly language: Language;
  readonly kind?: ScoreKind;
}): EditorNotice | null {
  const copy = frameCopy(options.language);
  if (options.message) return { text: options.message, action: "edit" };
  if (options.unsaved && !options.editable) {
    return { text: fillCopy(copy.viewOnlyEdits, { name: options.name }), action: "edit" };
  }
  if (!options.unsaved && !options.editable) {
    return {
      text: options.kind === "generated" ? copy.readOnlyGeneratedBody : copy.readOnlyBody,
      action: "edit",
    };
  }
  return null;
}

/** The frame's tag while the editor is shown: an editable one has the package's label, read-only needs ours. */
export function sourceTag(
  editable: boolean,
  language: Language,
  kind: ScoreKind = "scoreFile",
): string | null {
  // A generated read-only mount already reads "Generated score"; only a file mount is mislabelled.
  if (editable || kind === "generated") return null;
  return frameCopy(language).scoreFileReadOnlyTag;
}

/** A retry never runs while the editor holds unsaved edits: reloading would discard them. */
export function canRetry(unsaved: boolean): boolean {
  return !unsaved;
}

/** The header's folder line; a file at the Space root says so instead of leaving the row out. */
export function folderLine(path: string, language: Language): string | null {
  if (path === "") return null;
  return folderLabel(path) ?? frameCopy(language).spaceRoot;
}

/** The folder a Space path sits in; a file at the root has none. */
export function folderOf(path: string): string | null {
  const trimmed = path.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  if (slash <= 0) return null;
  return trimmed.slice(0, slash);
}

/** A folder line that keeps the folder nearest the file when the path is long. */
export function folderLabel(path: string, max = 42): string | null {
  const folder = folderOf(path);
  if (folder === null || folder.length <= max) return folder;
  const parts = folder.split("/");
  for (let count = Math.min(parts.length, 4); count >= 1; count -= 1) {
    const candidate = `…/${parts.slice(-count).join("/")}`;
    if (candidate.length <= max) return candidate;
  }
  const last = parts[parts.length - 1] ?? "";
  return `…/${last.slice(Math.max(0, last.length - (max - 2)))}`;
}
