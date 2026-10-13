export const MEADOW_RADIUS = 26;
export const FIRE_CLEARANCE = 1.6;
export const POSE_SEND_HZ = 15;
export const EMBER_HALF_LIFE_MS = 5 * 60 * 1000;
export const EMBER_COOLDOWN_MS = 20 * 1000;
export const ROUND_MS = 80 * 1000;
export const MAX_ROUNDS = 8;
export const ROOM_MAX_PARTICIPANTS = 64;
export const MEDIA_BUDGET = 16;
export const LIVE_WINDOW_MS = 20 * 1000;
export const SUMMON_WINDOW_MS = 75 * 1000;

export const peerChannels = {
  pose: "pose",
  emote: "emote",
  ink: "ink",
} as const;

export const mediaTracks = { mic: "mic", cam: "cam", screen: "screen" } as const;

export const roomEvents = {
  chat: "campfire.chat",
  ember: "campfire.ember",
  summon: "spirit.summon",
  awake: "spirit.awake",
  speak: "spirit.speak",
  voice: "spirit.voice",
  dismiss: "spirit.dismiss",
  gone: "spirit.gone",
  sketchStart: "sketch.start",
  sketchRound: "sketch.round",
  sketchGuess: "sketch.guess",
  sketchReveal: "sketch.reveal",
  sketchEnd: "sketch.end",
  sketchSync: "sketch.sync",
} as const;

export type ChatData = { text: string; name: string; toSpirit?: boolean };
export type EmberData = { name: string };
export type EmoteData = { emoji: string };
export type SpeakData = { id: string; text: string; name: string; story?: boolean };
export type VoiceData = { id: string; audio: string };
export type GoneData = { reason: "idle" | "dismissed" | "empty" | "ended" | "failed" };

export const SPIRIT_ROLE = "spirit";
export const EMOTES = ["🔥", "✨", "😂", "👏", "🫶", "😮"] as const;
