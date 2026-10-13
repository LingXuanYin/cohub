export type Pose = {
  x: number;
  y: number;
  angle: number;
  level: number;
  moving: boolean;
  talking: boolean;
  mic: boolean;
  cam: boolean;
};

export const POSE_FRAME_BYTES = 7;

const TAU = Math.PI * 2;
const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);

export const encodePose = (pose: Pose): ArrayBuffer => {
  const frame = new Uint8Array(POSE_FRAME_BYTES);
  const view = new DataView(frame.buffer);
  frame[0] = (pose.moving ? 1 : 0) | (pose.talking ? 2 : 0) | (pose.cam ? 4 : 0) | (pose.mic ? 8 : 0);
  view.setInt16(1, Math.round(clamp(pose.x, -327, 327) * 100), true);
  view.setInt16(3, Math.round(clamp(pose.y, -327, 327) * 100), true);
  frame[5] = Math.round(((((pose.angle % TAU) + TAU) % TAU) / TAU) * 256) & 0xff;
  frame[6] = Math.round(clamp(pose.level, 0, 1) * 127);
  return frame.buffer;
};

export const decodePose = (data: ArrayBuffer | ArrayBufferView): Pose | null => {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (bytes.byteLength !== POSE_FRAME_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = bytes[0] ?? 0;
  return {
    x: view.getInt16(1, true) / 100,
    y: view.getInt16(3, true) / 100,
    angle: ((bytes[5] ?? 0) / 256) * TAU,
    level: (bytes[6] ?? 0) / 127,
    moving: (flags & 1) !== 0,
    talking: (flags & 2) !== 0,
    cam: (flags & 4) !== 0,
    mic: (flags & 8) !== 0,
  };
};

export const RENDER_DELAY_MS = 140;

export type PoseTrack = { samples: Array<{ at: number; pose: Pose }> };

export const createTrack = (): PoseTrack => ({ samples: [] });

export const pushSample = (track: PoseTrack, at: number, pose: Pose) => {
  track.samples.push({ at, pose });
  if (track.samples.length > 8) track.samples.splice(0, track.samples.length - 8);
};

export const sampleTrack = (track: PoseTrack, at: number): Pose | null => {
  const samples = track.samples;
  const last = samples[samples.length - 1];
  if (!last) return null;
  if (at >= last.at) return last.pose;
  for (let index = samples.length - 1; index > 0; index -= 1) {
    const after = samples[index];
    const before = samples[index - 1];
    if (!after || !before || at < before.at) continue;
    const span = after.at - before.at;
    const ratio = span <= 0 ? 1 : (at - before.at) / span;
    return {
      ...after.pose,
      x: before.pose.x + (after.pose.x - before.pose.x) * ratio,
      y: before.pose.y + (after.pose.y - before.pose.y) * ratio,
      angle: lerpAngle(before.pose.angle, after.pose.angle, ratio),
      level: before.pose.level + (after.pose.level - before.pose.level) * ratio,
    };
  }
  return samples[0]?.pose ?? null;
};

export const lerpAngle = (from: number, to: number, ratio: number) => {
  const delta = ((((to - from + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return from + delta * ratio;
};

type Point = { x: number; y: number };

const bothAtHearth = (a: Point, b: Point, hearth: number) =>
  Math.hypot(a.x, a.y) <= hearth && Math.hypot(b.x, b.y) <= hearth;

export const WHISPER_RANGE = 2.2;
export const EARSHOT = 12;

export const hearingDistance = (listener: Point, speaker: Point, hearth: number) =>
  bothAtHearth(listener, speaker, hearth) ? 0 : Math.hypot(speaker.x - listener.x, speaker.y - listener.y);

export const voiceVolume = (distance: number) => {
  if (distance <= WHISPER_RANGE) return 1;
  if (distance >= EARSHOT) return 0;
  const t = 1 - (distance - WHISPER_RANGE) / (EARSHOT - WHISPER_RANGE);
  return t * t;
};
