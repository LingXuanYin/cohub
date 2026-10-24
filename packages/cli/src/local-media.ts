import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MediaFacts } from "@neta-art/cohub/media";

const run = promisify(execFile);

type ProbeOutput = {
  streams?: Array<{ width?: number; height?: number; side_data_list?: Array<{ rotation?: number }> }>;
  format?: { duration?: string };
};

const oriented = (width: number, height: number, turned: boolean) => (turned ? { width: height, height: width } : { width, height });

export async function localMediaFacts(file: string, type: "image" | "video", signal?: AbortSignal): Promise<MediaFacts | null> {
  try {
    if (type === "image") {
      const { default: sharp } = await import("sharp");
      const { width = 0, height = 0, orientation = 1 } = await sharp(file).metadata();
      return width > 0 && height > 0 ? oriented(width, height, orientation >= 5) : null;
    }
    const { stdout } = await run("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height:stream_side_data=rotation:format=duration", "-of", "json", file,
    ], { signal, timeout: 5_000 });
    const { streams, format } = JSON.parse(stdout) as ProbeOutput;
    const stream = streams?.[0];
    if (!stream?.width || !stream.height) return null;
    const rotation = stream.side_data_list?.find((data) => data.rotation !== undefined)?.rotation ?? 0;
    const durationMs = Math.round(Number(format?.duration) * 1000);
    return {
      ...oriented(stream.width, stream.height, Math.abs(rotation) % 180 === 90),
      ...(durationMs > 0 ? { durationMs } : {}),
    };
  } catch {
    return null;
  }
}
