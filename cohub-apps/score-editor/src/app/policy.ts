import { formatDiagnostic, type Diagnostic } from "@neta-art/score-editor";
import type { HostFailure } from "../host/host.ts";
import { fillCopy, frameCopy, type Language } from "./copy.ts";
import type { HandoffOutcome } from "./handoff.ts";

export type FrameStateName = "loading" | "no-file" | "no-host";

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
export type FailureAction = "access" | "retry" | "save-as" | "none";

export type StateContent = { readonly title: string; readonly body: string };

export function stateCopy(state: FrameStateName, name: string | null, language: Language): StateContent {
  const copy = frameCopy(language);
  if (state === "loading") {
    return { title: fillCopy(copy.opening, { name: name ?? copy.scoreFileTag }), body: "" };
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
  options: { readonly unsaved: boolean; readonly name: string; readonly language: Language },
): FailurePresentation {
  const copy = frameCopy(options.language);
  const fill = (template: string) => fillCopy(template, { name: options.name });

  let content: StateContent;
  let action: FailureAction;
  if (state.status === "file-gone") {
    content = { title: fill(copy.goneTitle), body: copy.goneBody };
    // A move arrives as a relaunch, so a file that is gone without one was deleted: offer a new file.
    action = options.unsaved ? "save-as" : "none";
  } else if (state.status === "failed") {
    content = { title: fill(copy.failedTitle), body: copy.failedBody };
    action = "retry";
  } else {
    content = {
      title: fill(state.reason === "revoked" ? copy.revokedTitle : copy.noPermissionTitle),
      body: state.reason === "revoked" ? copy.revokedBody : copy.noPermissionBody,
    };
    action = "access";
  }

  if (!options.unsaved) return { ...content, keepEditor: false, action };
  return { title: content.title, body: copy.editsKept, keepEditor: true, action };
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
  readonly language: Language;
}): EditorNotice | null {
  const copy = frameCopy(options.language);
  if (options.message) return { text: options.message, action: "edit" };
  if (options.unsaved && !options.editable) return { text: copy.editsKept, action: "edit" };
  if (!options.unsaved && !options.editable) return { text: copy.readOnlyBody, action: "edit" };
  return null;
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
