import assert from "node:assert/strict";
import { test } from "node:test";
import { editorNotice, failurePresentation, folderLabel, folderLine, launchChoice, stateCopy } from "../src/app/policy.ts";
import { folderOf } from "../src/host/path.ts";
import { frameCopy } from "../src/app/copy.ts";

const GONE = { status: "file-gone" } as const;
const REVOKED = { status: "no-permission", reason: "revoked" } as const;
const MISSING = { status: "no-permission", reason: "missing" } as const;
const FAILED = { status: "failed" } as const;

test("another file's launch waits while this window has unsaved edits", () => {
  assert.equal(launchChoice("other", true), "hold");
  assert.equal(launchChoice("other", false), "other");
  assert.equal(launchChoice("moved", true), "moved");
  assert.equal(launchChoice("same", true), "same");
});

test("a failure keeps the editor only when the score has unsaved changes", () => {
  assert.equal(failurePresentation(GONE, { unsaved: true, name: "a.abc", language: "en" }).keepEditor, true);
  assert.equal(failurePresentation(GONE, { unsaved: false, name: "a.abc", language: "en" }).keepEditor, false);
});

test("a revoked failure with edits names the cause, the kept edits and the next step", () => {
  const shown = failurePresentation(REVOKED, { unsaved: true, name: "a.abc", language: "en" });
  assert.match(shown.body, /Access to a\.abc was removed/);
  assert.match(shown.body, /Your changes are still here/);
  assert.match(shown.body, /Ask for access, then save again/);
  assert.equal(shown.action, "access");
});

test("every state with unsaved edits keeps the editor mounted", () => {
  for (const state of [REVOKED, MISSING, FAILED, GONE] as const) {
    assert.equal(failurePresentation(state, { unsaved: true, name: "a.abc", language: "en" }).keepEditor, true);
  }
});

test("a failure without edits says nothing was changed", () => {
  const gone = failurePresentation(GONE, { unsaved: false, name: "a.abc", language: "en" });
  assert.match(gone.body, /Nothing was changed\./);
  assert.match(gone.body, /open it again from its Space/);
  assert.equal(gone.action, "close");
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
  assert.match(revoked.body, /morning-walk\.abc/);
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
  assert.equal(folderOf("morning-walk.abc"), "");
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



test("kept edits without edit access say who must grant edit access", () => {
  const kept = editorNotice({ unsaved: true, editable: false, message: null, name: "intro.abc", language: "en" });
  assert.ok(kept);
  assert.match(kept.text, /You can view intro\.abc but not change it/);
  assert.match(kept.text, /Your changes are still here/);
  assert.equal(kept.action, "edit");
  const viewOnly = editorNotice({ unsaved: false, editable: false, message: null, name: "intro.abc", language: "en" });
  assert.ok(viewOnly);
  assert.match(viewOnly.text, /view intro\.abc/i);
  assert.equal(viewOnly.action, "edit");
  assert.equal(editorNotice({ unsaved: true, editable: true, message: null, name: "intro.abc", language: "en" }), null);
  const denied = editorNotice({ unsaved: true, editable: false, message: frameCopy("en").accessNotGiven, name: "intro.abc", language: "en" });
  assert.equal(denied?.text, "Access was not given. Nothing was changed. Ask again when you are ready.");
});

test("a deleted file with edits has no frame button and names the cause", () => {
  const gone = failurePresentation(GONE, { unsaved: true, name: "intro.abc", language: "en" });
  assert.equal(gone.action, "none");
  assert.match(gone.body, /intro\.abc was deleted/);
  assert.match(gone.body, /Save again/);
  assert.doesNotMatch(gone.body, /still here/i);
  const zh = failurePresentation(GONE, { unsaved: true, name: "intro.abc", language: "zh" });
  assert.match(zh.body, /intro\.abc 被删除了/);
});

test("a deleted file without edits offers closing the window", () => {
  const gone = failurePresentation(GONE, { unsaved: false, name: "intro.abc", language: "en" });
  assert.equal(gone.action, "close");
});

test("Try again is never offered while edits are unsaved", () => {
  const failed = failurePresentation(FAILED, { unsaved: true, name: "intro.abc", language: "en" });
  assert.equal(failed.action, "none");
  assert.match(failed.body, /Your changes are still here/);
  assert.match(failed.body, /Save again when you can/);
});

test("lost access with edits names the cause and the next step", () => {
  const revoked = failurePresentation(REVOKED, { unsaved: true, name: "intro.abc", language: "en" });
  assert.equal(revoked.action, "access");
  assert.match(revoked.body, /Access to intro\.abc was removed/);
  assert.match(revoked.body, /save again/i);
  assert.match(revoked.body, /Ask for access/);
});

test("the access, back and view-only lines are in both languages", () => {
  const copy = frameCopy("en");
  assert.equal(copy.accessBack, "Access is back. Save again to keep your changes.");
  assert.match(copy.viewOnlyEdits, /Space's owner/);
  assert.match(copy.backWithChanges, /\{name\} is back/);
  assert.equal(frameCopy("zh").accessBack, "权限已恢复。再保存一次，保住你的修改。");
});

test("a root file's folder line says Space root", () => {
  assert.equal(folderLine("intro.abc", "en"), "Space root");
  assert.equal(folderLine("intro.abc", "zh"), "Space 根目录");
  assert.equal(folderLine("scores/intro.abc", "en"), "scores");
});

test("the startup title reads as the review asked", () => {
  assert.equal(frameCopy("en").startupFailedTitle, "Couldn't connect to Cohub");
});

test("a view-only grant with edits explains who must grant edit access", () => {
  const notice = editorNotice({ unsaved: true, editable: false, message: null, name: "intro.abc", language: "en" });
  assert.ok(notice);
  assert.match(notice.text, /You can view intro\.abc but not change it/);
  assert.equal(notice.action, "edit");
});
