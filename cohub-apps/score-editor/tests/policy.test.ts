import assert from "node:assert/strict";
import { test } from "node:test";
import { editorNotice, failurePresentation, folderLabel, folderOf, stateCopy } from "../src/app/policy.ts";

const GONE = { status: "file-gone" } as const;
const REVOKED = { status: "no-permission", reason: "revoked" } as const;
const MISSING = { status: "no-permission", reason: "missing" } as const;
const FAILED = { status: "failed" } as const;

test("a failure keeps the editor only when the score has unsaved changes", () => {
  assert.equal(failurePresentation(GONE, { unsaved: true, name: "a.abc", language: "en" }).keepEditor, true);
  assert.equal(failurePresentation(GONE, { unsaved: false, name: "a.abc", language: "en" }).keepEditor, false);
});

test("a failure with edits says the changes are still here", () => {
  const shown = failurePresentation(REVOKED, { unsaved: true, name: "a.abc", language: "en" });
  assert.match(shown.body, /changes are still here/i);
  assert.doesNotMatch(shown.body, /Nothing was changed/i);
  assert.equal(shown.action, "access");
});

test("a failure without edits says nothing was changed", () => {
  const gone = failurePresentation(GONE, { unsaved: false, name: "a.abc", language: "en" });
  assert.match(gone.body, /Nothing was changed\./);
  assert.equal(gone.action, "none");
  const failed = failurePresentation(FAILED, { unsaved: false, name: "a.abc", language: "en" });
  assert.match(failed.body, /Nothing was changed/);
  assert.equal(failed.action, "retry");
});

test("permission failures name the file and offer access", () => {
  const missing = failurePresentation(MISSING, { unsaved: false, name: "morning-walk.abc", language: "en" });
  assert.match(missing.title, /morning-walk\.abc/);
  assert.equal(missing.action, "access");
  const revoked = failurePresentation(REVOKED, { unsaved: false, name: "morning-walk.abc", language: "en" });
  assert.match(revoked.title, /morning-walk\.abc/);
  assert.doesNotMatch(revoked.body, /reload/i);
});

test("file gone names the file and does not assume a move", () => {
  const gone = failurePresentation(GONE, { unsaved: false, name: "a.abc", language: "en" });
  assert.match(gone.title, /a\.abc/);
  assert.doesNotMatch(gone.body, /new place|moved to/i);
});

test("the state copy is in both languages and names the file while loading", () => {
  assert.match(stateCopy("loading", "a.abc", "en").title, /a\.abc/);
  assert.match(stateCopy("loading", "a.abc", "zh").title, /a\.abc/);
  assert.match(stateCopy("no-file", null, "en").body, /score file/i);
  assert.match(stateCopy("no-host", null, "zh").body, /乐谱文件/);
});

test("a file at the Space root has no folder line", () => {
  assert.equal(folderOf("morning-walk.abc"), null);
  assert.equal(folderLabel("morning-walk.abc"), null);
  assert.equal(folderOf("scores/morning-walk.abc"), "scores");
});

test("a deep folder keeps the folder nearest the file", () => {
  const path = "projects/2026/morning-walk/scores/drafts/morning-walk.abc";
  const label = folderLabel(path, 28);
  assert.ok(label);
  assert.ok(label.endsWith("drafts"));
  assert.ok(label.startsWith("…"));
  assert.ok(label.length <= 28);
});

test("a gone file with kept edits offers saving a new file", () => {
  const gone = failurePresentation(GONE, { unsaved: true, name: "a.abc", language: "en" });
  assert.equal(gone.action, "save-as");
  assert.match(gone.body, /still here/i);
});

test("kept edits without edit access keep the edits line, not the read-only line", () => {
  const kept = editorNotice({ unsaved: true, editable: false, message: null, language: "en" });
  assert.ok(kept);
  assert.match(kept.text, /changes are still here/i);
  assert.equal(kept.action, "edit");
  const viewOnly = editorNotice({ unsaved: false, editable: false, message: null, language: "en" });
  assert.ok(viewOnly);
  assert.match(viewOnly.text, /view this score file/i);
  assert.equal(viewOnly.action, "edit");
  assert.equal(editorNotice({ unsaved: true, editable: true, message: null, language: "en" }), null);
  const denied = editorNotice({ unsaved: true, editable: false, message: "Access was not given.", language: "en" });
  assert.equal(denied?.text, "Access was not given.");
});
