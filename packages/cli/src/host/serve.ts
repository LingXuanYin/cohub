import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  HOST_BRIDGE_ERROR,
  HOST_BRIDGE_METHODS,
  HOST_SERVICE_VERSION,
  hostBridgeRequestSchema,
  type HostBridgeCapability,
  type HostBridgeMethod,
  type HostServiceHello,
} from "@neta-art/cohub/host-bridge";
import { currentIdentityKey } from "../space.js";
import { HostAuth } from "./auth.js";
import { loginShellEnv } from "./login-env.js";
import { DeviceRuntimeHost } from "./runtime.js";

export type HostEmit = (name: string, payload?: unknown) => void;

type Handler = (params: Record<string, unknown>) => Promise<unknown> | unknown;

const CAPABILITIES = ["auth.token", "auth.signIn", "auth.session", "runtime"] as const satisfies readonly HostBridgeCapability[];
const MAX_LINE = 1024 * 1024;

const write = (message: unknown) => process.stdout.write(`${JSON.stringify(message)}\n`);

export async function serveHost(entry = fileURLToPath(new URL("../../bin/cohub.js", import.meta.url))) {
  const emit: HostEmit = (name, payload) => write({ type: "event", name, ...(payload === undefined ? {} : { payload }) });
  let environment: Promise<NodeJS.ProcessEnv> | null = null;
  const runtime = new DeviceRuntimeHost(emit, {
    cli: entry,
    env: () => (environment ??= loginShellEnv()),
    account: currentIdentityKey,
  });
  const auth = new HostAuth(emit, () => {
    runtime.changed();
    void runtime.restore();
  });

  const handlers = {
    "auth.getAccessToken": (params) => auth.accessToken(params.forceRefresh === true),
    "auth.getSessionVersion": () => auth.sessionVersion(),
    "auth.getSession": () => auth.session(),
    "auth.signIn": (params) => auth.signIn(typeof params.redirectPath === "string" ? params.redirectPath : undefined),
    "auth.signOut": () => auth.signOut(),
    "runtime.list": () => runtime.list(),
    "runtime.browse": (params) => runtime.browse(typeof params.path === "string" ? params.path : undefined),
    "runtime.start": (params) => runtime.connect(String(params.spaceId), String(params.root)),
    "runtime.stop": (params) => runtime.disconnect(String(params.spaceId)),
  } satisfies Partial<Record<HostBridgeMethod, Handler>>;
  const methods = Object.keys(handlers) as (keyof typeof handlers)[];

  const answer = async (line: string) => {
    let raw: unknown;
    try { raw = JSON.parse(line); } catch { return; }
    const request = hostBridgeRequestSchema.safeParse(raw);
    if (!request.success) return;
    const { id, method } = request.data;
    const fail = (code: string, message: string) => write({ type: "response", id, error: { code, message: message.slice(0, 2_000) || "Host call failed" } });
    if (!(method in handlers)) return fail(HOST_BRIDGE_ERROR.unsupported, `Unsupported method: ${method}`);
    const name = method as keyof typeof handlers;
    const shape = HOST_BRIDGE_METHODS[name];
    const params = shape.params.safeParse(request.data.params);
    if (!params.success) return fail(HOST_BRIDGE_ERROR.failed, `Invalid params for ${method}`);
    try {
      const result = await handlers[name]((params.data ?? {}) as Record<string, unknown>);
      write({ type: "response", id, result: shape.result.parse(result) });
    } catch (error) {
      fail(HOST_BRIDGE_ERROR.failed, error instanceof Error ? error.message : String(error));
    }
  };

  const hello: HostServiceHello = { type: "hello", version: HOST_SERVICE_VERSION, capabilities: [...CAPABILITIES], methods };
  write(hello);
  auth.watch();
  runtime.watch();

  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on("line", (line) => { if (line.length <= MAX_LINE) void answer(line); });
  await new Promise<void>((resolve) => input.once("close", resolve));
  auth.close();
  runtime.close();
}
