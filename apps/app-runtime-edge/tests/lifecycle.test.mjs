import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../browser/runtime.ts", import.meta.url))],
  bundle: true,
  format: "iife",
  platform: "browser",
  write: false,
  define: { __COHUB_RUNTIME_ENV__: '"prod"' },
});
const source = bundle.outputFiles[0].text;
const origin = "https://embedder.example";
const request = (action = "subscribe", subscriptionId = "subscription-1") => ({
  type: "cohub.runtime.lifecycle", version: 1, action, subscriptionId,
});
const paint = (startTime = 125) => ({ entryType: "paint", name: "first-contentful-paint", startTime });

function createRuntime({ observerMode = "supported", topLevel = false, throwPost = false } = {}) {
  const messages = [];
  const listeners = [];
  const observations = [];
  let callback;
  let disconnected = 0;
  const parent = { postMessage(message, targetOrigin) {
    if (throwPost) throw new Error("Frame detached");
    messages.push({ message: structuredClone(message), targetOrigin });
  } };
  const window = { parent, addEventListener(type, listener) {
    assert.equal(type, "message");
    listeners.push(listener);
  } };
  if (topLevel) window.parent = window;
  class Observer {
    constructor(listener) {
      if (observerMode === "constructor-throws") throw new Error("Unsupported observer");
      callback = listener;
    }
    observe(options) {
      if (observerMode === "observe-throws") throw new Error("Unsupported entry type");
      observations.push(structuredClone(options));
    }
    disconnect() { disconnected += 1; }
  }
  if (observerMode === "unsupported") Observer.supportedEntryTypes = ["resource"];
  const context = createContext({
    window, URL, crypto: { randomUUID }, performance: { timeOrigin: 1_800_000_000_000 },
    console: { log() {} },
    ...(observerMode === "missing" ? {} : { PerformanceObserver: Observer }),
  });
  const load = () => runInContext(source, context);
  load();
  return {
    messages, observations, listeners, load,
    get disconnected() { return disconnected; },
    receive(data = request(), options = {}) {
      for (const listener of listeners) listener({ source: parent, origin, data, ...options });
    },
    emit(entries = [paint()]) { callback?.({ getEntries: () => entries }); },
  };
}

test("subscription acknowledges an empty snapshot, then reports FCP once with document timing", () => {
  const runtime = createRuntime();
  assert.deepEqual(runtime.observations, [{ type: "paint", buffered: true }]);
  assert.equal(runtime.messages.length, 0);
  runtime.receive();
  const initial = runtime.messages[0];
  assert.equal(initial.targetOrigin, origin);
  assert.deepEqual(initial.message, {
    type: "cohub.runtime.lifecycle", version: 1, action: "state", subscriptionId: "subscription-1",
    documentId: initial.message.documentId, timeOrigin: 1_800_000_000_000, milestones: [],
  });
  assert.ok(initial.message.documentId.length > 0);
  runtime.emit([{ entryType: "paint", name: "first-paint", startTime: 10 }, paint()]);
  assert.deepEqual(runtime.messages[1].message.milestones, [{ name: "first-contentful-paint", startTime: 125 }]);
  assert.equal(runtime.messages[1].message.documentId, initial.message.documentId);
  runtime.emit([paint(250)]);
  assert.equal(runtime.messages.length, 2);
  assert.equal(runtime.disconnected, 1);
});

test("late and repeated subscriptions replay FCP, replacing the single parent subscription", () => {
  const runtime = createRuntime();
  runtime.emit();
  runtime.receive();
  runtime.receive();
  assert.deepEqual(runtime.messages[0], runtime.messages[1]);
  assert.equal(runtime.messages[0].message.milestones.length, 1);
  runtime.receive(request("subscribe", "replacement"));
  assert.equal(runtime.messages[2].message.subscriptionId, "replacement");
  runtime.receive(request("unsubscribe", "subscription-1"));
  runtime.receive(request("subscribe", "replacement"));
  assert.deepEqual(runtime.messages[2], runtime.messages[3]);
});

test("only direct-parent HTTP(S) origins and valid v1 requests can subscribe", () => {
  const runtime = createRuntime();
  for (const value of [null, [], "subscribe", {}, { ...request(), version: 2 },
    { ...request(), type: "other" }, request("state"), request("subscribe", ""),
    request("subscribe", " "), request("subscribe", "x".repeat(129)),
    { ...request(), subscriptionId: 42 }]) runtime.receive(value);
  runtime.receive(request(), { source: {} });
  for (const invalid of ["null", "", "file://", "ftp://host.example", "https://host.example/path"])
    runtime.receive(request(), { origin: invalid });
  assert.equal(runtime.messages.length, 0);
  runtime.receive(request("subscribe", "x".repeat(128)), { origin: "http://localhost:1234" });
  assert.equal(runtime.messages[0].targetOrigin, "http://localhost:1234");
});

test("unsubscribe must match the current subscription and origin; later subscribe replays retained FCP", () => {
  const runtime = createRuntime();
  runtime.receive();
  runtime.receive(request("subscribe", "current"));
  runtime.receive(request("unsubscribe", "subscription-1"));
  runtime.receive(request("unsubscribe", "current"), { origin: "https://other.example" });
  runtime.emit();
  assert.equal(runtime.messages.length, 3);
  assert.equal(runtime.messages[2].message.subscriptionId, "current");
  const beforePaint = createRuntime();
  beforePaint.receive();
  beforePaint.receive(request("unsubscribe"));
  beforePaint.emit();
  assert.equal(beforePaint.messages.length, 1);
  beforePaint.receive();
  assert.equal(beforePaint.messages[1].message.milestones.length, 1);
});

test("unsupported or failing paint observers still return empty snapshots", () => {
  for (const observerMode of ["missing", "unsupported", "constructor-throws", "observe-throws"]) {
    const runtime = createRuntime({ observerMode });
    runtime.receive();
    assert.deepEqual(runtime.messages[0].message.milestones, []);
  }
});

test("invalid paint entries cannot become milestones", () => {
  const runtime = createRuntime();
  runtime.receive();
  runtime.emit([paint(-1), paint(Number.NaN), paint(Number.POSITIVE_INFINITY), { ...paint(), entryType: "resource" }]);
  assert.equal(runtime.messages.length, 1);
  runtime.emit([paint(0)]);
  assert.deepEqual(runtime.messages[1].message.milestones, [{ name: "first-contentful-paint", startTime: 0 }]);
});

test("bootstrap stays idempotent per document and separate documents have distinct identities", () => {
  const runtime = createRuntime();
  runtime.load();
  runtime.receive();
  assert.equal(runtime.listeners.length, 1);
  assert.equal(runtime.observations.length, 1);
  const nextDocument = createRuntime();
  nextDocument.receive();
  assert.notEqual(runtime.messages[0].message.documentId, nextDocument.messages[0].message.documentId);
  assert.equal(createRuntime({ topLevel: true }).listeners.length, 0);
});

test("a detached parent does not break runtime observation", () => {
  const runtime = createRuntime({ throwPost: true });
  assert.doesNotThrow(() => runtime.receive());
  assert.doesNotThrow(() => runtime.emit());
  assert.equal(runtime.disconnected, 1);
});
