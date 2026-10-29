import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { withRuntimeSpaceBindingsLock } from "../runtime/space-binding.js";

export type HostRuntime = { key: string; spaceId: string; root: string };

type HostRuntimesFile = { version: 1; runtimes: HostRuntime[] };

export const hostRuntimesPath = () => join(homedir(), ".local", "state", "cohub", "host", "runtimes.json");

// Only a missing file is empty; an unreadable one throws, so it is never overwritten.
async function read(path: string): Promise<HostRuntime[]> {
  let text: string;
  try { text = await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const file = JSON.parse(text) as Partial<HostRuntimesFile>;
  if (file.version !== 1 || !Array.isArray(file.runtimes)) throw new Error(`Unsupported desktop Runtime state: ${path}`);
  return file.runtimes.filter((item): item is HostRuntime =>
    typeof item?.key === "string" && typeof item.spaceId === "string" && typeof item.root === "string");
}

async function update(path: string, change: (runtimes: HostRuntime[]) => HostRuntime[]) {
  await withRuntimeSpaceBindingsLock(async () => {
    const before = await read(path);
    const after = change(before);
    if (JSON.stringify(after) === JSON.stringify(before)) return;
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify({ version: 1, runtimes: after } satisfies HostRuntimesFile, null, 2)}\n`, { mode: 0o600, flag: "wx" });
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  }, { path });
}

export const hostRuntimes = (key: string, path = hostRuntimesPath()) =>
  read(path).then((runtimes) => runtimes.filter((item) => item.key === key));

export const rememberHostRuntime = (runtime: HostRuntime, path = hostRuntimesPath()) =>
  update(path, (runtimes) => [...runtimes.filter((item) => item.key !== runtime.key || item.spaceId !== runtime.spaceId), runtime]);

export const forgetHostRuntime = (key: string, spaceId: string, path = hostRuntimesPath()) =>
  update(path, (runtimes) => runtimes.filter((item) => item.key !== key || item.spaceId !== spaceId));
