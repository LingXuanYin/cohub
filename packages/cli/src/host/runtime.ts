import { spawn } from "node:child_process";
import { mkdirSync, watch, type FSWatcher } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import type { DEVICE_RUNTIME_REFUSALS, DeviceFolderListing, DeviceRuntime, DeviceRuntimeInstance } from "@neta-art/cohub/host-bridge";
import { EXPECTED_IDENTITY_ENV } from "../runtime/launch.js";
import { requestRuntimeInstance, runtimeInstanceDirectory, runtimeInstancesRoot, stopRuntimeInstance, watchRuntimeInstance } from "../runtime/instance.js";
import type { RuntimeSummary } from "../runtime/presentation.js";
import { readRuntimeSpaceBindings, runtimeSpaceBindingsPath } from "../runtime/space-binding.js";
import { forgetHostRuntime, hostRuntimes, rememberHostRuntime } from "./runtimes.js";
import type { HostEmit } from "./serve.js";

const MAX_INSTANCES = 256;
const MAX_FOLDERS = 10_000;
const MAX_VOLUMES = 16;

type Refusal = (typeof DEVICE_RUNTIME_REFUSALS)[number];

export type DeviceRuntimeHostOptions = {
  cli: string;
  env: () => Promise<NodeJS.ProcessEnv>;
  account: () => string | null;
};

const isRunning = (instance: DeviceRuntimeInstance | undefined): instance is DeviceRuntimeInstance =>
  instance?.state === "connecting" || instance?.state === "ready";
const samePath = (a: string, b: string) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

function deviceState(status: RuntimeSummary | null): DeviceRuntimeInstance["state"] {
  if (!status || status.state === "stopping") return "stopped";
  if (status.state === "ready") return "ready";
  return status.state === "attention" ? "error" : "connecting";
}

function displayPath(path: string, home = homedir()) {
  if (process.platform === "win32") return path;
  const inside = relative(home, path);
  if (!inside) return "~";
  return inside.startsWith("..") || inside.startsWith(sep) ? path : `~/${inside}`;
}

async function isDirectory(path: string) {
  return stat(path).then((info) => info.isDirectory(), () => false);
}

async function volumes(): Promise<DeviceFolderListing["volumes"]> {
  const home = homedir();
  const homeVolume = { path: home, label: basename(home) || home };
  if (process.platform === "win32") {
    const drives = await Promise.all([..."CDEFGHIJKLMNOPQRSTUVWXYZ"].map(async (letter) => {
      const path = `${letter}:\\`;
      return await isDirectory(path) ? { path, label: `${letter}:` } : null;
    }));
    return [homeVolume, ...drives.filter((drive) => drive !== null)].slice(0, MAX_VOLUMES);
  }
  if (process.platform === "darwin") {
    const mounted = await readdir("/Volumes").catch(() => []);
    const resolved = await Promise.all(mounted.map(async (name) => {
      const path = await realpath(join("/Volumes", name)).catch(() => null);
      return path ? { path, label: name } : null;
    }));
    return [homeVolume, ...resolved.filter((volume) => volume !== null)].slice(0, MAX_VOLUMES);
  }
  return [homeVolume, { path: "/", label: "/" }];
}

export class DeviceRuntimeHost {
  #watchers: FSWatcher[] = [];
  #subscriptions = new Map<string, AbortController>();
  #debounce: NodeJS.Timeout | undefined;
  #published = "";
  #restoring: Promise<void> = Promise.resolve();
  #unwatchable = new Set<string>();

  constructor(
    private readonly emit: HostEmit,
    private readonly options: DeviceRuntimeHostOptions,
  ) {}

  watch() {
    this.#watch();
    void this.restore();
  }

  close() {
    clearTimeout(this.#debounce);
    for (const watcher of this.#watchers) watcher.close();
    for (const subscription of this.#subscriptions.values()) subscription.abort();
  }

  #watch() {
    const bindings = runtimeSpaceBindingsPath();
    const instances = runtimeInstancesRoot();
    mkdirSync(dirname(bindings), { recursive: true, mode: 0o700 });
    mkdirSync(instances, { recursive: true, mode: 0o700 });
    const watchers = [
      watch(dirname(bindings), (_event, name) => { if (!name || name === basename(bindings)) this.changed(); }),
      watch(instances, { recursive: true }, () => this.changed()),
    ];
    this.#watchers = watchers;
    const rewatch = () => {
      if (this.#watchers !== watchers) return;
      this.#watchers = [];
      for (const watcher of watchers) watcher.close();
      setTimeout(() => { this.#watch(); this.changed(); }, 1_000).unref();
    };
    for (const watcher of watchers) watcher.on("error", rewatch);
  }

  changed() {
    clearTimeout(this.#debounce);
    this.#debounce = setTimeout(() => void this.#publish().catch(() => undefined), 100);
  }

  async list(): Promise<DeviceRuntime> {
    const key = this.options.account();
    if (!key) return { instances: [] };
    const bindings = (await readRuntimeSpaceBindings().catch(() => ({ bindings: [] }))).bindings;
    const roots = new Map<string, string>();
    for (const binding of bindings) {
      if (binding.key !== key) continue;
      roots.delete(binding.spaceId);
      roots.set(binding.spaceId, binding.root);
    }
    const instances = await Promise.all([...roots].slice(-MAX_INSTANCES).map(async ([spaceId, root]): Promise<DeviceRuntimeInstance> => {
      const directory = runtimeInstanceDirectory(key, spaceId);
      try {
        const status = await requestRuntimeInstance(directory);
        if (status) this.#subscribe(directory, status.pid);
        const path = status?.root ?? root;
        return { spaceId, root: path, label: displayPath(path), state: deviceState(status), error: status?.state === "attention" ? "attention" : null };
      } catch {
        return { spaceId, root, label: displayPath(root), state: "error", error: "unreachable" };
      }
    }));
    return { instances };
  }

  async browse(path?: string): Promise<DeviceFolderListing> {
    const target = await realpath(path ?? homedir());
    if (!await isDirectory(target)) throw new Error("Not a folder");
    const entries = await readdir(target, { withFileTypes: true });
    const folders = (await Promise.all(entries.map(async (entry) => {
      if (entry.name.startsWith(".")) return null;
      const folder = join(target, entry.name);
      const directory = entry.isDirectory() || (entry.isSymbolicLink() && await isDirectory(folder));
      return directory ? { name: entry.name, path: folder } : null;
    })))
      .filter((folder) => folder !== null)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
      .slice(0, MAX_FOLDERS);
    const key = this.options.account();
    const bindings = key ? (await readRuntimeSpaceBindings().catch(() => ({ bindings: [] }))).bindings : [];
    const parent = dirname(target);
    return {
      path: target,
      label: displayPath(target),
      parent: parent === target ? null : parent,
      spaceId: bindings.filter((binding) => binding.key === key && samePath(binding.root, target)).at(-1)?.spaceId ?? null,
      folders,
      volumes: await volumes(),
    };
  }

  async connect(spaceId: string, root: string): Promise<DeviceRuntime & { refused: Refusal | null }> {
    const key = this.options.account();
    if (!key) throw new Error("Sign in first");
    const folder = await realpath(root).catch(() => null);
    const current = await this.list();
    if (!folder || !await isDirectory(folder)) return { ...current, refused: "folder_unavailable" };
    const serving = current.instances.find((instance) => instance.spaceId === spaceId);
    if (isRunning(serving)) return { ...current, refused: samePath(serving.root, folder) ? null : "space_in_use" };
    if (current.instances.some((instance) => isRunning(instance) && samePath(instance.root, folder))) return { ...current, refused: "folder_in_use" };
    await this.#launch(key, spaceId, folder);
    await rememberHostRuntime({ key, spaceId, root: folder });
    return { ...await this.#publish(), refused: null };
  }

  async disconnect(spaceId: string): Promise<DeviceRuntime> {
    const key = this.options.account();
    if (!key) throw new Error("Sign in first");
    await stopRuntimeInstance(runtimeInstanceDirectory(key, spaceId));
    await forgetHostRuntime(key, spaceId);
    return this.#publish();
  }

  restore(): Promise<void> {
    this.#restoring = this.#restoring.then(async () => {
      const key = this.options.account();
      if (!key) return;
      // A failed read skips this restore; nothing is forgotten.
      const { bindings } = await readRuntimeSpaceBindings();
      for (const item of await hostRuntimes(key)) {
        const bound = bindings.filter((binding) => binding.key === key && binding.spaceId === item.spaceId).at(-1);
        if (!bound || !samePath(bound.root, item.root)) { await forgetHostRuntime(key, item.spaceId); continue; }
        const running = await requestRuntimeInstance(runtimeInstanceDirectory(key, item.spaceId)).catch(() => true);
        if (running || !await isDirectory(item.root)) continue;
        await this.#launch(key, item.spaceId, item.root).catch((error: unknown) => {
          process.stderr.write(`Could not reconnect ${item.root}: ${error instanceof Error ? error.message : String(error)}\n`);
        });
      }
    }).catch((error: unknown) => {
      process.stderr.write(`Could not restore connected folders: ${error instanceof Error ? error.message : String(error)}\n`);
    }).finally(() => this.changed());
    return this.#restoring;
  }

  async #publish(): Promise<DeviceRuntime> {
    const runtime = await this.list();
    const serialized = JSON.stringify(runtime);
    if (serialized !== this.#published) {
      this.#published = serialized;
      this.emit("runtime.changed", runtime);
    }
    return runtime;
  }

  #subscribe(directory: string, pid: number) {
    const instance = `${directory}:${pid}`;
    if (this.#subscriptions.has(directory) || this.#unwatchable.has(instance)) return;
    const controller = new AbortController();
    this.#subscriptions.set(directory, controller);
    void watchRuntimeInstance(directory, () => this.changed(), controller.signal).then((streamed) => {
      if (!streamed) this.#unwatchable.add(instance);
    }, () => undefined).finally(() => {
      if (this.#subscriptions.get(directory) === controller) this.#subscriptions.delete(directory);
      if (!controller.signal.aborted) this.changed();
    });
  }

  async #launch(key: string, spaceId: string, root: string) {
    const env = await this.options.env();
    if (this.options.account() !== key) throw new Error("The signed-in account changed");
    const child = spawn(process.execPath, [this.options.cli, "runtime", "up", root, "--space", spaceId, "--detach", "--yes", "--no-display", "--json"], {
      env: { ...env, [EXPECTED_IDENTITY_ENV]: key }, stdio: ["ignore", "ignore", "pipe"], windowsHide: true,
    });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-8_192); });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    if (code === 0 || code === 2) return;
    const reason = stderr.trim().split("\n").at(-1)?.replace(/^Runtime failed: /, "");
    throw new Error(reason || `Runtime exited (${code})`);
  }
}
