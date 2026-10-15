import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { RtcOptions } from "./rooms-rtc.js";

export async function launchRoomRtc(roomId: string, options: RtcOptions) {
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  const worker = fork(fileURLToPath(new URL(`./rooms-rtc-worker.${extension}`, import.meta.url)), [roomId, JSON.stringify(options)], { stdio: ["inherit", "inherit", "inherit", "ipc"] });
  const interrupt = () => worker.kill("SIGINT");
  const terminate = () => worker.kill("SIGTERM");
  process.once("SIGINT", interrupt); process.once("SIGTERM", terminate);
  try {
    await new Promise<void>((done, reject) => {
      worker.once("error", reject);
      worker.once("exit", (code, signal) => code === 0 ? done() : reject(new Error(`RTC worker exited with ${signal ?? code}`)));
    });
  } finally {
    process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", terminate);
  }
}
