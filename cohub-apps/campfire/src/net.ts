import type {
  AppRoom,
  AppRoomEvent,
  AppRoomRtc,
  AppRtcChannel,
  AppRtcLocalTrack,
  AppRtcRemoteTrack,
  AppRtcTrackInput,
  CohubClient,
  RealtimeRoomMember,
  RtcTransportStats,
} from "@neta-art/cohub";
import { batchInk, decodeInk, type InkOp } from "./ink";
import { decodePose, encodePose, type Pose } from "./pose";
import { peerChannels, POSE_SEND_HZ, ROOM_MAX_PARTICIPANTS, SPIRIT_ROLE, type EmoteData } from "./protocol";

export type Transport = "connecting" | "peer" | "relay";

export type Member = {
  participantId: string;
  joinedAt: string;
  kind: "user" | "agent" | "cli";
  model: string | null;
  name: string;
  color: string;
  spirit: boolean;
  thinking: boolean;
  playing: boolean;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  x: number;
  y: number;
  self: boolean;
};

export type RemoteTrack = {
  participantId: string;
  name: string;
  kind: "audio" | "video";
  track: MediaStreamTrack;
  setQuality: (quality: "low" | "medium" | "high") => void;
};

export type RoomLogEvent = {
  type: string;
  data: unknown;
  at: number;
  sequence: number;
  participantId: string;
  self: boolean;
};

export type Presence = {
  name: string;
  color: string;
  playing: boolean;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  x: number;
  y: number;
};

export type Connection = { transport: Transport; rttMs: number | null; path: string | null };

type Events = Record<string, unknown>;

export type SessionEvents = {
  onMembers: (members: Member[]) => void;
  onTracks: (tracks: RemoteTrack[]) => void;
  onConnection: (connection: Connection) => void;
  onEvent: (event: RoomLogEvent) => void;
  onPose: (participantId: string, pose: Pose) => void;
  onEmote: (participantId: string, emote: EmoteData) => void;
  onInk: (participantId: string, ops: InkOp[]) => void;
  onReset: () => void;
  onNotice: (notice: "reconnecting" | "no-rtc" | "no-relay") => void;
  planMedia: (candidates: Array<{ participantId: string; name: string; kind: "audio" | "video" }>) => Set<string>;
};

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const STILL_INTERVAL_MS = 1000;
const RELAY_INTERVAL_MS = 250;
const MEDIA_INTERVAL_MS = 700;
const STATS_INTERVAL_MS = 4000;
const HISTORY_PAGE = 200;
const INK_PEER_BYTES = 48_000;
const INK_RELAY_BYTES = 10_000;
const HISTORY_PAGES = 6;

export const DEFAULT_COLORS = ["#f4a261", "#8ecae6", "#b8e0a0", "#e9c46a", "#c9b6f5", "#f2a0a0"] as const;
const FALLBACK_COLOR = DEFAULT_COLORS[0];

export class FireSession {
  readonly code: string;
  private readonly client: CohubClient;
  private readonly events: SessionEvents;
  private room: AppRoom<Events> | null = null;
  private rtc: AppRoomRtc | null = null;
  private pose: AppRtcChannel | null = null;
  private emote: AppRtcChannel | null = null;
  private ink: AppRtcChannel | null = null;
  private readonly localTracks = new Map<string, AppRtcLocalTrack>();
  private readonly offs: Array<() => unknown> = [];
  private readonly timers: Array<ReturnType<typeof setInterval>> = [];
  private presence: Presence;
  private connection: Connection = { transport: "connecting", rttMs: null, path: null };
  private cursor = 0;
  private backlog: AppRoomEvent<unknown>[] | null = null;
  private relayNeeded = false;
  private peered = new Set<string>();
  private lastRelayPoseAt = Number.NEGATIVE_INFINITY;
  private lastPose: Pose | null = null;
  private lastPoseAt = Number.NEGATIVE_INFINITY;
  private mediaKeys = new Set<string>();
  private disposed = false;

  constructor(client: CohubClient, code: string, presence: Presence, events: SessionEvents) {
    this.client = client;
    this.code = code;
    this.presence = presence;
    this.events = events;
  }

  get participantId() {
    return this.room?.participantId ?? "";
  }

  get roomId() {
    return this.room?.id ?? "";
  }

  get peerReady() {
    return this.rtc !== null;
  }

  async join() {
    const realtime = this.client.app.realtime;
    const room = await realtime.joinRoom<Events>({ code: this.code }).catch((error: unknown) => {
      if (!isMissingRoom(error)) throw error;
      return realtime.createRoom<Events>({ code: this.code, maxParticipants: ROOM_MAX_PARTICIPANTS, seatPerUser: true });
    });
    this.room = room;
    this.backlog = [];

    this.offs.push(
      room.subscribeAll((event) => (this.backlog ? this.backlog.push(event) : this.receive(event))),
      room.onMembersChanged((members) => this.absorb(members)),
      room.onStateChange((state) => {
        if (state === "reconnecting") this.events.onNotice("reconnecting");
      }),
      room.onOutOfSync(() => {
        this.epoch += 1;
        this.cursor = 0;
        this.events.onReset();
        void this.catchUp();
      }),
    );

    await this.setPresence({});
    this.absorb(room.members);
    await this.catchUp();
    void this.openPeer();
    this.timers.push(
      setInterval(() => this.reconcileMedia(), MEDIA_INTERVAL_MS),
      setInterval(() => void this.sampleStats(), STATS_INTERVAL_MS),
    );
  }

  async setPresence(patch: Partial<Presence>) {
    this.presence = { ...this.presence, ...patch };
    await this.room?.setPresence({ role: "camper", ...this.presence }).catch(() => undefined);
  }

  async publish(type: string, data: unknown) {
    await this.room?.publish(type, data);
  }

  signal(type: string, data: unknown) {
    this.room?.send(type, data);
  }

  private get relaying() {
    return !this.pose || this.relayNeeded;
  }

  sendPose(pose: Pose) {
    this.lastPose = pose;
    const now = performance.now();
    const frame = encodePose(pose);
    if (this.pose && now - this.lastPoseAt >= (pose.moving || pose.talking ? 1000 / POSE_SEND_HZ : STILL_INTERVAL_MS)) {
      this.lastPoseAt = now;
      this.pose.send(frame);
    }
    if (this.relaying && now - this.lastRelayPoseAt >= RELAY_INTERVAL_MS) {
      this.lastRelayPoseAt = now;
      this.signal(peerChannels.pose, { b: toBase64(new Uint8Array(frame)) });
    }
  }

  sendEmote(emote: EmoteData) {
    this.emote?.send(emote);
    if (this.relaying) this.signal(peerChannels.emote, emote);
  }

  sendInk(ops: InkOp[]) {
    if (ops.length === 0) return;
    if (this.ink) for (const batch of batchInk(ops, INK_PEER_BYTES)) this.ink.send(batch);
    if (this.relaying) for (const batch of batchInk(ops, INK_RELAY_BYTES)) this.signal(peerChannels.ink, { b: toBase64(batch) });
  }

  async publishTracks(tracks: Record<string, AppRtcTrackInput>) {
    if (!this.rtc) throw new Error("peer connection unavailable");
    const handles = await this.rtc.publish(tracks);
    for (const [name, handle] of Object.entries<AppRtcLocalTrack>(handles)) this.localTracks.set(name, handle);
  }

  async replaceTrack(name: string, track: MediaStreamTrack) {
    await this.localTracks.get(name)?.replace(track);
  }

  async stopTrack(name: string) {
    const handle = this.localTracks.get(name);
    this.localTracks.delete(name);
    await handle?.stop().catch(() => undefined);
  }

  hasTrack(name: string) {
    return this.localTracks.has(name);
  }

  async invite(expiresInSeconds = 900) {
    if (!this.room) throw new Error("not in a room");
    return this.room.invite({ expiresInSeconds });
  }

  async leave() {
    const room = this.room;
    this.dispose();
    await room?.leave().catch(() => undefined);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
    for (const timer of this.timers.splice(0)) clearInterval(timer);
    this.rtc?.close();
    this.rtc = null;
  }

  private absorb(members: RealtimeRoomMember[]) {
    const own = this.room?.participantId ?? "";
    const people = members.filter((member) => member.participantId !== own && (member.kind ?? "user") === "user");
    this.peered = new Set(people.filter(hasPeerChannels).map((member) => member.participantId));
    this.relayNeeded = people.some((member) => !this.peered.has(member.participantId));
    this.events.onMembers(members.map((member) => toMember(member, own)));
    this.reconcileMedia();
  }

  private receive(event: AppRoomEvent<unknown>) {
    if (event.sequence <= this.cursor) return;
    this.cursor = event.sequence;
    const from = event.sender.participantId;
    if (event.type === peerChannels.pose || event.type === peerChannels.emote || event.type === peerChannels.ink) {
      const duplicate = this.pose !== null && this.peered.has(from);
      if (!event.self && !duplicate) this.lane(event.type, from, event.data);
      return;
    }
    this.events.onEvent({
      type: event.type,
      data: event.data,
      at: event.timestamp,
      sequence: event.sequence,
      participantId: from,
      self: event.self,
    });
  }

  private lane(type: string, from: string, data: unknown) {
    const bytes = typeof (data as { b?: unknown })?.b === "string" ? fromBase64((data as { b: string }).b) : null;
    if (type === peerChannels.pose && bytes) {
      const pose = decodePose(bytes);
      if (pose) this.events.onPose(from, pose);
    } else if (type === peerChannels.ink && bytes) {
      this.events.onInk(from, decodeInk(bytes));
    } else if (type === peerChannels.emote && typeof (data as EmoteData)?.emoji === "string") {
      this.events.onEmote(from, data as EmoteData);
    }
  }

  private catching = false;
  private epoch = 0;

  private async catchUp() {
    const room = this.room;
    if (!room || this.catching) return;
    this.catching = true;
    this.backlog ??= [];
    const epoch = this.epoch;
    try {
      for (let page = 0; page < HISTORY_PAGES && !this.disposed; page += 1) {
        const { events } = await room.history({ after: this.cursor, limit: HISTORY_PAGE });
        if (epoch !== this.epoch) break;
        for (const event of events) this.receive(event);
        if (events.length < HISTORY_PAGE) break;
      }
    } catch {
    } finally {
      this.catching = false;
      if (epoch !== this.epoch && !this.disposed) {
        void this.catchUp();
      } else {
        const backlog = this.backlog ?? [];
        this.backlog = null;
        for (const event of backlog.sort((a, b) => a.sequence - b.sequence)) this.receive(event);
      }
    }
  }

  private async openPeer() {
    if (typeof RTCPeerConnection === "undefined" || !this.room) {
      this.setConnection({ transport: "relay", rttMs: null, path: null });
      this.events.onNotice("no-rtc");
      return;
    }
    try {
      const rtc = await this.room.rtc();
      if (this.disposed) return rtc.close();
      this.rtc = rtc;
      this.pose = rtc.channel(peerChannels.pose, { delivery: "latest" });
      this.emote = rtc.channel(peerChannels.emote);
      this.ink = rtc.channel(peerChannels.ink);
      this.offs.push(
        rtc.onStateChange((state) => {
          if (state === "connected") this.setConnection({ ...this.connection, transport: "peer" });
          else if (state === "reconnecting") this.events.onNotice("reconnecting");
        }),
        rtc.onTracksChanged((tracks) => this.events.onTracks(tracks.map(toRemoteTrack))),
        this.pose.onMessage(({ from, data }) => {
          const pose = data instanceof ArrayBuffer ? decodePose(data) : null;
          if (pose) this.events.onPose(from, pose);
        }),
        this.emote.onMessage(({ from, data }) => {
          if (typeof (data as EmoteData)?.emoji === "string") this.events.onEmote(from, data as EmoteData);
        }),
        this.ink.onMessage(({ from, data }) => {
          if (data instanceof ArrayBuffer) this.events.onInk(from, decodeInk(new Uint8Array(data)));
        }),
      );
      this.setConnection({ transport: rtc.state === "connected" ? "peer" : "connecting", rttMs: null, path: null });
      if (this.lastPose) this.pose.send(encodePose(this.lastPose));
      this.reconcileMedia();
    } catch (error) {
      this.setConnection({ transport: "relay", rttMs: null, path: null });
      this.events.onNotice((error as { code?: string }).code === "RTC_UNSUPPORTED" ? "no-rtc" : "no-relay");
    }
  }

  private setConnection(next: Connection) {
    this.connection = next;
    this.events.onConnection(next);
  }

  private async sampleStats() {
    if (!this.rtc) return;
    const stats: RtcTransportStats | null = await this.rtc.stats().catch(() => null);
    if (!stats) return;
    this.setConnection({ transport: this.rtc.state === "connected" ? "peer" : "connecting", rttMs: stats.rttMs, path: stats.path });
  }

  private reconcileMedia() {
    const rtc = this.rtc;
    if (!rtc) return;
    const keys = this.events.planMedia(rtc.candidates);
    if (sameKeys(keys, this.mediaKeys)) return;
    this.mediaKeys = keys;
    rtc.select((candidate) => keys.has(`${candidate.participantId}:${candidate.name}`));
  }
}

const hasPeerChannels = (member: RealtimeRoomMember) =>
  (member.publications ?? []).some((publication) => publication.kind === "data" && publication.name === peerChannels.pose);

const isMissingRoom = (error: unknown) => {
  const code = (error as { code?: unknown })?.code;
  if (code === "ROOM_NOT_FOUND" || code === "ROOM_EXPIRED") return true;
  return /not found|expired/i.test(String((error as Error)?.message ?? ""));
};

const toMember = (member: RealtimeRoomMember, own: string): Member => {
  const presence = (member.presence ?? {}) as Record<string, unknown>;
  const name = typeof presence.name === "string" && presence.name.trim() ? presence.name.trim().slice(0, 24) : "";
  return {
    participantId: member.participantId,
    joinedAt: member.joinedAt,
    kind: member.kind === "agent" || member.kind === "cli" ? member.kind : "user",
    model: member.model?.id ?? null,
    name,
    color: typeof presence.color === "string" && COLOR_RE.test(presence.color) ? presence.color : FALLBACK_COLOR,
    spirit: presence.role === SPIRIT_ROLE && (member.kind === "cli" || member.kind === "agent"),
    thinking: presence.thinking === true,
    playing: presence.playing === true,
    mic: presence.mic === true,
    cam: presence.cam === true,
    screen: presence.screen === true,
    x: typeof presence.x === "number" && Number.isFinite(presence.x) ? presence.x : 0,
    y: typeof presence.y === "number" && Number.isFinite(presence.y) ? presence.y : 6,
    self: member.participantId === own,
  };
};

const toRemoteTrack = (track: AppRtcRemoteTrack): RemoteTrack => ({
  participantId: track.participantId,
  name: track.name,
  kind: track.kind,
  track: track.track,
  setQuality: (quality) => void track.setQuality(quality).catch(() => undefined),
});

const sameKeys = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((key) => b.has(key));

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
