import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { AppRtcRemoteTrack } from "@neta-art/cohub";
import { createRealtimeClient } from "../client.js";
import { readRoomLines } from "./rooms-connect.js";

type Source = { track: MediaStreamTrack; frameBytes: number; durationMs: number; write(bytes: Uint8Array): void; close(): void };
type Frame = { timestamp: number; data: Buffer; sampleRate?: number; channels?: number; width?: number; height?: number; format: string };
type Adapter = {
  createPeerConnection(configuration: RTCConfiguration): RTCPeerConnection;
  audioSource(options: { sampleRate: number; channels: number }): Source;
  videoSource(options: { width: number; height: number; fps: number }): Source;
  sink(track: MediaStreamTrack, handler: (frame: Frame) => void): () => void;
};
export type RtcOptions = { adapter: string; audio?: string; video?: string; size?: string; fps: string; rate: string; channels: string; output?: string; participant?: string; channel?: string; delivery: "reliable" | "latest"; dataInput?: string; json?: boolean };

export async function pumpMedia(path: string, source: Source, signal: AbortSignal) {
  if (signal.aborted) { source.close(); return; }
  const input = path === "-" ? process.stdin : createReadStream(path, { highWaterMark: Math.max(64 * 1024, source.frameBytes) });
  const abort = () => input.destroy();
  signal.addEventListener("abort", abort, { once: true });
  let pending = Buffer.alloc(0);
  let deadline = performance.now();
  try {
    for await (const chunk of input) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      pending = pending.length ? Buffer.concat([pending, bytes]) : bytes;
      while (pending.length >= source.frameBytes && !signal.aborted) {
        await delay(Math.max(0, deadline - performance.now()), undefined, { signal });
        source.write(pending.subarray(0, source.frameBytes));
        pending = pending.subarray(source.frameBytes);
        deadline = Math.max(deadline + source.durationMs, performance.now());
      }
    }
    if (!signal.aborted && pending.length) throw new Error("Media input ends with an incomplete frame");
  } finally {
    signal.removeEventListener("abort", abort);
    input.destroy();
    source.close();
  }
}

export async function runRoomRtc(roomId: string, options: RtcOptions) {
  if (options.delivery !== "reliable" && options.delivery !== "latest") throw new Error("--delivery must be reliable or latest");
  if (options.dataInput && !options.channel) throw new Error("--data-input requires --channel");
  if (options.audio === "-" && options.video === "-") throw new Error("Only one media input can use stdin");
  if (options.dataInput === "-" && (options.audio === "-" || options.video === "-")) throw new Error("Only one input can use stdin");
  const require = createRequire(resolve(process.cwd(), "package.json"));
  const adapter = await import(require.resolve(options.adapter)) as Adapter;
  for (const key of ["createPeerConnection", "audioSource", "videoSource", "sink"] as const) {
    if (typeof adapter[key] !== "function") throw new Error(`RTC adapter is missing ${key}`);
  }
  const controller = new AbortController();
  const signal = controller.signal;
  const stop = () => controller.abort();
  const sources: Record<string, Source> = {};
  const tasks: Promise<void>[] = [];
  const receivers = new Map<string, { track: MediaStreamTrack; close(): void }>();
  const streams = new Set<ReturnType<typeof createWriteStream>>();
  let failure: unknown;
  const fail = (cause: unknown) => { failure ??= cause; stop(); };
  const cancelled = () => { if (failure) throw failure; return signal.aborted; };
  const report = (kind: string, data: Record<string, unknown>) => {
    const output = options.output === "-" ? process.stderr : process.stdout;
    if (output.writableLength > 1024 * 1024) { fail(new Error("RTC output is too slow")); return; }
    output.write(`${JSON.stringify({ kind, ...data })}\n`);
  };
  process.stdout.on("error", fail);
  const client = createRealtimeClient();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let room: Awaited<ReturnType<typeof client.rooms.connect>> | undefined;
  let rtc: Awaited<ReturnType<NonNullable<typeof room>["rtc"]>> | undefined;
  try {
    if (options.audio) sources.audio = adapter.audioSource({ sampleRate: Number(options.rate), channels: Number(options.channels) });
    if (options.video) {
      const [width, height] = (options.size ?? "").split("x").map(Number);
      sources.video = adapter.videoSource({ width: width ?? 0, height: height ?? 0, fps: Number(options.fps) });
    }
    if (options.output && options.output !== "-") await mkdir(resolve(options.output), { recursive: true });
    room = await client.rooms.connect(roomId);
    if (cancelled()) return;
    room.onStateChange((state) => { report("room", { state }); if (state === "closed" || state === "expired") stop(); });
    rtc = await room.rtc({ createPeerConnection: adapter.createPeerConnection });
    if (cancelled()) return;
    rtc.select((candidate) => Boolean(options.output) && (!options.participant || candidate.participantId === options.participant));
    rtc.onStateChange((state) => { report("rtc", { state }); if (state === "closed") stop(); });
    const attach = (tracks: AppRtcRemoteTrack[]) => {
      const wanted = new Set(tracks.map((item) => `${item.participantId}:${item.name}`));
      for (const [key, receiver] of receivers) if (!wanted.has(key)) { receiver.close(); receivers.delete(key); }
      if (!options.output) return;
      for (const item of tracks) {
        const key = `${item.participantId}:${item.name}`;
        if (receivers.get(key)?.track === item.track) continue;
        receivers.get(key)?.close();
        if (options.output === "-") {
          const segment = crypto.randomUUID();
          const off = adapter.sink(item.track, ({ data, ...frame }) => {
            if (signal.aborted) return;
            if (process.stdout.writableLength + data.length > 16 * 1024 * 1024) { fail(new Error("Media output is too slow")); return; }
            const metadata = Buffer.from(JSON.stringify({ version: 1, segment, ...frame, bytes: data.length, participantId: item.participantId, name: item.name }));
            const header = Buffer.alloc(4); header.writeUInt32BE(metadata.length);
            process.stdout.write(header); process.stdout.write(metadata); process.stdout.write(data);
          });
          receivers.set(key, { track: item.track, close: off });
          report("track", { participantId: item.participantId, name: item.name, segment });
          continue;
        }
        const file = resolve(options.output, `${item.participantId}-${item.name.replace(/[^a-zA-Z0-9_-]/g, "_")}-${crypto.randomUUID()}`);
        const media = createWriteStream(`${file}.${item.kind === "audio" ? "pcm" : "i420"}`, { flags: "wx" });
        const metadata = createWriteStream(`${file}.ndjson`, { flags: "wx" });
        streams.add(media); streams.add(metadata);
        media.once("close", () => streams.delete(media));
        metadata.once("close", () => streams.delete(metadata));
        media.on("error", fail); metadata.on("error", fail);
        let offset = 0;
        const off = adapter.sink(item.track, ({ data, ...frame }) => {
          if (signal.aborted) return;
          if (media.writableLength + data.length > 16 * 1024 * 1024 || metadata.writableLength > 1024 * 1024) { fail(new Error("Media output is too slow")); return; }
          media.write(data);
          metadata.write(`${JSON.stringify({ ...frame, offset, bytes: data.length, participantId: item.participantId, name: item.name })}\n`);
          offset += data.length;
        });
        receivers.set(key, { track: item.track, close() { off(); media.end(); metadata.end(); } });
        report("track", { participantId: item.participantId, name: item.name, file });
      }
    };
    rtc.onTracksChanged(attach);
    attach(rtc.tracks);
    if (options.channel) {
      const channel = rtc.channel(options.channel, { delivery: options.delivery });
      channel.onMessage(({ from, data }) => report("data", { from, data: data instanceof ArrayBuffer ? { base64: Buffer.from(data).toString("base64") } : data }));
      if (options.dataInput && !signal.aborted) {
        const input = options.dataInput === "-" ? process.stdin : createReadStream(options.dataInput);
        const abort = () => input.destroy();
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
        tasks.push((async () => {
          try {
            for await (const line of readRoomLines(input)) {
              if (signal.aborted) break;
              if (line.trim() && !channel.send(JSON.parse(line))) throw new Error("RTC data channel is backpressured");
            }
          } finally { signal.removeEventListener("abort", abort); input.destroy(); }
        })().catch((cause) => { if (!signal.aborted) fail(cause); }));
      }
    }
    const publications = Object.keys(sources).length
      ? await rtc.publish(Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, value.track])))
      : {};
    if (cancelled()) return;
    for (const [name, source] of Object.entries(sources)) {
      const path = name === "audio" ? options.audio : options.video;
      tasks.push(pumpMedia(path as string, source, signal)
        .finally(async () => { if (!signal.aborted) await publications[name]?.stop(); })
        .catch((cause) => { if (!signal.aborted) fail(cause); }));
    }
    report("connected", { roomId, participantId: room.participantId });
    if (!signal.aborted) await new Promise<void>((done) => signal.addEventListener("abort", () => done(), { once: true }));
  } finally {
    stop();
    for (const receiver of receivers.values()) receiver.close();
    for (const source of Object.values(sources)) source.close();
    await Promise.allSettled(tasks);
    await rtc?.shutdown().catch(fail);
    await client.disconnect();
    await room?.disconnect().catch(() => undefined);
    await Promise.all([...streams].map((stream) => stream.closed ? Promise.resolve() : new Promise<void>((done) => stream.once("close", done))));
    process.stdout.removeListener("error", fail);
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
  if (failure) throw failure;
}
