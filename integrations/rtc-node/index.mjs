import wrtc from "@roamhq/wrtc";

export const createPeerConnection = (configuration) => new wrtc.RTCPeerConnection(configuration);

export function audioSource({ sampleRate = 48000, channels = 1 } = {}) {
  if (![8000, 16000, 32000, 48000].includes(sampleRate) || ![1, 2].includes(channels)) throw new Error("Use 8/16/32/48 kHz PCM with one or two channels");
  const source = new wrtc.nonstandard.RTCAudioSource();
  const track = source.createTrack();
  const samplesPerFrame = sampleRate / 100;
  return {
    track,
    frameBytes: samplesPerFrame * channels * 2,
    durationMs: 10,
    write(data) {
      if (data.byteLength !== samplesPerFrame * channels * 2) throw new Error("Audio frames must contain exactly 10 ms of s16le PCM");
      const samples = new Int16Array(samplesPerFrame * channels);
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true);
      source.onData({ samples, sampleRate, bitsPerSample: 16, channelCount: channels, numberOfFrames: samplesPerFrame });
    },
    close() { track.stop(); },
  };
}

export function videoSource({ width, height, fps = 30 }) {
  if (![width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 4096 && value % 2 === 0) || !Number.isFinite(fps) || fps < 1 || fps > 60) throw new Error("Use even video dimensions up to 4096 and 1–60 fps");
  const source = new wrtc.nonstandard.RTCVideoSource();
  const track = source.createTrack();
  return {
    track,
    frameBytes: width * height * 3 / 2,
    durationMs: 1000 / fps,
    write(data) {
      if (data.byteLength !== width * height * 3 / 2) throw new Error("Video frames must contain a complete I420 frame");
      source.onFrame({ width, height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) });
    },
    close() { track.stop(); },
  };
}

export function sink(track, onFrame) {
  const audio = track.kind === "audio";
  const receiver = audio ? new wrtc.nonstandard.RTCAudioSink(track) : new wrtc.nonstandard.RTCVideoSink(track);
  receiver[audio ? "ondata" : "onframe"] = (event) => {
    const frame = audio ? event : event.frame;
    const bytes = audio ? frame.samples : frame.data;
    onFrame({
      timestamp: performance.now(),
      ...(audio ? { sampleRate: frame.sampleRate, channels: frame.channelCount, format: "s16le" } : { width: frame.width, height: frame.height, format: "i420" }),
      data: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    });
  };
  return () => receiver.stop();
}
