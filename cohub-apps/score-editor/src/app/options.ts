import type { OpenedScoreFile } from "../host/host.ts";
import type { Language } from "./copy.ts";

export type EditorOptions = {
  readonly language: Language;
  readonly editable: boolean;
  readonly title: string;
  /** A read-only editor gets no save source, so no Save control and no conflict strip can exist. */
  readonly source?: OpenedScoreFile["source"];
};

export function editorOptionsFor(opened: OpenedScoreFile, language: Language): EditorOptions {
  if (!opened.editable) {
    return { language, editable: false, title: opened.name };
  }
  return { language, editable: true, title: opened.name, source: opened.source };
}
