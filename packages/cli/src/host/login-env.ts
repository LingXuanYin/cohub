import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";

const TIMEOUT_MS = 10_000;
// Cohub settings come from the host, never from the user's shell.
const SCOPED = /^(COHUB_.*|ENV)$/;

const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

export async function loginShellEnv(base: NodeJS.ProcessEnv = process.env, platform = process.platform): Promise<NodeJS.ProcessEnv> {
  const scoped = Object.fromEntries(Object.entries(base).filter(([key]) => SCOPED.test(key)));
  if (platform === "win32") return base;
  const shell = base.SHELL || (platform === "darwin" ? "/bin/zsh" : "/bin/sh");
  const mark = randomUUID();
  const print = `${quote(process.execPath)} -e ${quote("process.stdout.write(JSON.stringify(process.env))")}`;
  const output = await new Promise<string | null>((resolve) => {
    execFile(shell, ["-l", "-i", "-c", `printf %s ${mark}; ${print}; printf %s ${mark}`], {
      encoding: "utf8", timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024,
      env: base,
    }, (_error, stdout) => resolve(typeof stdout === "string" ? stdout : null));
  });
  const json = output?.split(mark)[1];
  if (!json) return base;
  try {
    const shellEnv = JSON.parse(json) as NodeJS.ProcessEnv;
    const inherited = Object.fromEntries(Object.entries(shellEnv).filter(([key]) => !SCOPED.test(key)));
    return { ...inherited, ...scoped };
  } catch {
    return base;
  }
}
