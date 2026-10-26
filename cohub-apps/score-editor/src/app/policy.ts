import type { HostFailure } from "../host/host.ts";
import { fillCopy, frameCopy, type Language } from "./copy.ts";

export type FrameStateName = "loading" | "no-file" | "no-host";
export type FailureAction = "access" | "retry" | "none";

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
    action = "none";
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
