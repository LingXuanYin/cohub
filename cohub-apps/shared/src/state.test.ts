import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppRuntimeContext } from "@neta-art/cohub";
import {
  hasScopes,
  readStored,
  replacePrompt,
  store,
} from "./state";
const context: AppRuntimeContext = {
  app: { id: "app", slug: "tasks", homeSpace: { id: "publisher" } },
  space: { id: "publisher", name: null },
  viewer: { userUuid: "viewer" },
  permissions: {
    scopes: ["taskrun.view"],
    appScopes: ["taskrun.view"],
    viewerScopes: [],
    viewerGrants: [{ spaceId: "target", scopes: ["checkpoint.view"] }],
  },
};
test("publisher permissions never grant access to a different invocation Space", () => {
  assert.equal(hasScopes(context, "target", ["taskrun.view"]), false);
  assert.equal(hasScopes(context, "publisher", ["taskrun.view"]), true);
  assert.equal(hasScopes(context, "target", ["checkpoint.view"]), true);
  assert.equal(hasScopes(context, "other", ["checkpoint.view"]), false);
});
test("storage failures preserve the caller's draft instead of claiming success", () => {
  assert.equal(
    store(
      "key",
      { text: "draft" },
      {
        setItem() {
          throw new Error("Quota exceeded");
        },
      },
    ),
    false,
  );
  assert.equal(readStored("key", { getItem: () => "invalid json" }), null);
});
test("structured prompts retain their original blocks unless edited with a structured editor", () => {
  const payload = {
    content: [
      { type: "text", text: "first", annotation: "keep" },
      { type: "text", text: "second" },
    ],
  };
  assert.equal(replacePrompt(payload, "first\nsecond"), payload);
  assert.throws(
    () => replacePrompt(payload, "replacement"),
    /structured prompt/,
  );
  assert.equal(payload.content.length, 2);
});
