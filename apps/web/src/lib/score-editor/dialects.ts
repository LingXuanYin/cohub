import { song2Dialect } from "@neta-art/score-dialect-song2";
import { createDialectRegistry } from "@neta-art/score-editor";

/** The score formats this app can open. A model is offered the editor only when it has a dialect here. */
export const scoreDialects = createDialectRegistry([song2Dialect]);
