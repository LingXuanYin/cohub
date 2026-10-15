import { runRoomRtc, type RtcOptions } from "./rooms-rtc.js";

let code = 0;
try {
  const roomId = process.argv[2];
  if (!roomId) throw new Error("Room id is required");
  const options = JSON.parse(process.argv[3] ?? "{}") as RtcOptions;
  await runRoomRtc(roomId, options);
} catch (cause) {
  code = 1;
  process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
}
// Native WebRTC must exit after releasing tracks and draining output, before addon finalizers run.
await Promise.all([new Promise<void>((done) => process.stdout.write("", () => done())), new Promise<void>((done) => process.stderr.write("", () => done()))]);
process.exit(code);
