# Optional Node RTC adapter

This standalone integration is intentionally **outside the pnpm workspace**. Neither the SDK nor CLI depends on it. It loads `@roamhq/wrtc` only in an explicitly requested RTC worker; no browser, FFmpeg, or model runtime is bundled.

## Install

The package is not published yet. From a separate Node project, install this directory by absolute path:

```sh
npm install /absolute/path/to/cohub/integrations/rtc-node
cohub rooms join '<invite>'
cohub rooms rtc <room-id> --output ./received
```

For repository development, run `npm ci --prefix integrations/rtc-node`, then pass `--adapter ./integrations/rtc-node/index.mjs` from the repository root. Native binaries are supplied by the upstream package for supported macOS, Linux and Windows architectures; installation fails explicitly on unsupported platforms.

## File and pipe inputs

Audio input is signed 16-bit little-endian PCM, 48 kHz mono by default. Video input is planar I420 with explicit, even dimensions. Inputs are paced by the CLI. A completed input stops that publication; the room keeps receiving until interrupted. Only one input may use stdin. No local device access is required.

```sh
ffmpeg -i speech.mp3 -f s16le -ar 48000 -ac 1 - \
  | cohub rooms rtc <room-id> --audio - --output ./received

ffmpeg -i clip.mp4 -an -pix_fmt yuv420p -vf scale=640:360 -r 30 -f rawvideo - \
  | cohub rooms rtc <room-id> --video - --size 640x360 --fps 30

cohub rooms rtc <room-id> --audio ./speech.pcm --video ./clip.i420 \
  --size 640x360 --fps 30 --output ./received --participant <participant-id>

printf '%s\n' '{"text":"Hello"}' \
  | cohub rooms rtc <room-id> --channel chat --data-input -
```

For live model consumers, `--output -` writes framed binary media to stdout and NDJSON status to stderr. Each frame consists of a 4-byte unsigned big-endian JSON header length, the UTF-8 header, then exactly `header.bytes` payload bytes. Headers contain `version: 1`, a unique `segment`, `participantId`, `name`, `format`, arrival `timestamp`, and audio/video parameters. Consumers must bound the header length (at most 64 KB) and validate payload sizes before allocating. This preserves track boundaries without Base64; use `--participant` to restrict inputs. Output backpressure is bounded and stops the session rather than silently losing media.

Output is NDJSON. Received audio/video is stored in unique, exclusively created `.pcm` / `.i420` files plus matching `.ndjson` metadata (format, relative monotonic arrival time, dimensions or sample format, byte offset and length, member and track). Track replacement/reconnect starts a new segment. These are **decoded received frames**, not lossless copies of a sender's source or the encoded RTP stream. Audio may be silence-concealed/resampled; network gaps cannot be reconstructed. Metadata arrival times are not sender timestamps and do not guarantee cross-track A/V sync. No mixing or re-encoding is implicit. Bound buffers fail explicitly when output is too slow; existing files are never overwritten.

`--channel` opens a named reliable DataChannel; `--delivery latest` uses best-effort delivery. Incoming binary messages are represented as `{ "base64": "..." }` in NDJSON. Media never travels through JSON/Base64. A second RTC connection on the same Agent seat is rejected rather than replacing the first. Graceful shutdown awaits server release before exiting. A crashed session may remain busy until server cleanup.

## Programmatic streams

The adapter exports `createPeerConnection`, `audioSource`, `videoSource` and `sink`. It does not change globals or depend on Cohub. Applications provide the SDK:

```js
import { CohubClient } from '@neta-art/cohub';
import { createPeerConnection, audioSource, sink } from '@neta-art/cohub-rtc-node';

const client = new CohubClient({ getAccessToken });
const room = await client.rooms.connect(roomId);
const rtc = await room.rtc({ createPeerConnection });
const audio = audioSource({ sampleRate: 48000, channels: 1 });
await rtc.publish({ voice: audio.track });
// Feed exactly 10 ms per write, paced by your realtime model or stream clock.
audio.write(pcmBytes); // 960 bytes for 48 kHz mono
// sink(remote.track, frame => consume(frame)) returns a cleanup function.
// Each videoSource write is one full I420 frame; pace by the selected fps.

// Stop all sinks and sources, then release RTC before detaching.
audio.close();
await rtc.shutdown();
await room.disconnect();
await client.disconnect();
```

The upstream native addon can segfault during automatic process finalization under Node 24. The CLI contains it in a child process, releases all tracks/sinks, awaits server release and file close, drains output, then explicitly exits. Programmatic native integrations should use the same child-process boundary; do not load it into a long-lived application host.

## Verification

From the repository root with development dependencies available:

```sh
npm ci --prefix integrations/rtc-node
node --import tsx --test integrations/rtc-node/loopback.test.mjs
```

The native test negotiates the **actual SDK state machine** against a local WebRTC peer, sends and receives audio/video and DataChannel frames, and verifies clean isolated process exit. It does not certify Cloudflare SFU deployment/configuration; test against a configured server before release.
