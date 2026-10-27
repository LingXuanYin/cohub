import type { ScoreHost } from "../host/host.ts";

export type EditorSaveAnswer = "saved" | "unchanged" | "conflict" | "failed";

/** What the frame needs from a mounted editor; `MountedEditor.save()` is this. */
export type SavingEditor = { save(): Promise<EditorSaveAnswer> };

/**
 * Arms the host's create-on-next-save and runs the editor's own Save, the same path as its button.
 * An answer that wrote nothing (`unchanged`) or could not write (`failed`) disarms the flag, so a later
 * plain Save sends the version again; `saved` and `conflict` were settled inside the save.
 */
export async function saveAsNewFile(
  host: Pick<ScoreHost, "armCreateOnNextSave" | "disarmCreateOnNextSave">,
  editor: SavingEditor,
): Promise<EditorSaveAnswer> {
  host.armCreateOnNextSave();
  const answer = await editor.save();
  if (answer === "failed" || answer === "unchanged") host.disarmCreateOnNextSave();
  return answer;
}
