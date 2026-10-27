import type { ScoreFileSource } from "@neta-art/score-editor";
import type { OpenedScore } from "../host/host.ts";
import type { Language } from "./copy.ts";

export type EditorOptions = {
  readonly language: Language;
  readonly editable: boolean;
  readonly title: string;
  /** A read-only editor gets no save source, so no Save control and no conflict strip can exist. */
  readonly source?: ScoreFileSource;
};

export function editorOptionsFor(opened: OpenedScore, language: Language): EditorOptions {
  if (!opened.editable) {
    return { language, editable: false, title: opened.name };
  }
  const source = opened.kind === "scoreFile" ? opened.source : undefined;
  return { language, editable: true, title: opened.name, ...(source ? { source } : {}) };
}
