import {
  APP_RTC_LIMITS,
  type AppRtcDelivery,
  type AppRtcMediaKind,
  type AppRtcOpenResponse,
  type AppRtcPublishResponse,
  type AppRtcSubscribeResponse,
  type AppRtcSubscriptionRef,
  type AppRtcUnpublishResponse,
  type AppRtcUnsubscribeResponse,
  isAppRtcName,
  type SessionDescription,
} from "@cohub/protocol/rtc";
import type { RealtimeRoomMember } from "@cohub/protocol/realtime";
import { readRtcTransportStats, type RtcTransportStats, waitForIceGathering } from "../rtc/index.js";
import { HttpError, type HttpTransport } from "../transport.js";

export type AppRtcState = "connecting" | "connected" | "reconnecting" | "closed";

export type AppRtcMessage<T = unknown> = {
  from: string;
  data: T | ArrayBuffer;
};

export type AppRtcChannelOptions = {
  delivery?: AppRtcDelivery;
};

export type AppRtcRemoteTrack = {
  participantId: string;
  name: string;
  kind: AppRtcMediaKind;
  track: MediaStreamTrack;
};

export type AppRtcLocalTrack = {
  readonly name: string;
  readonly kind: AppRtcMediaKind;
  readonly track: MediaStreamTrack;
  stop(): Promise<void>;
};

export type AppRtcHost = {
  roomId: string;
  appId: string;
  ticket: string;
  transport: HttpTransport;
  participantId(): string;
  members(): RealtimeRoomMember[];
  onMembersChanged(handler: (members: RealtimeRoomMember[]) => void): () => void;
};

const HEADER_BYTES = 5;
const FLAG_BINARY = 1;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeAppRtcFrame(data: unknown, sequence: number): Uint8Array {
  let payload: Uint8Array;
  let flags = 0;
  if (data instanceof ArrayBuffer) {
    payload = new Uint8Array(data);
    flags = FLAG_BINARY;
  } else if (ArrayBuffer.isView(data)) {
    payload = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    flags = FLAG_BINARY;
  } else {
    const json = JSON.stringify(data);
    if (json === undefined) throw new TypeError("RTC message is not serializable");
    payload = encoder.encode(json);
  }
  if (payload.byteLength > APP_RTC_LIMITS.messageBytes) {
    throw new RangeError(`RTC message exceeds ${APP_RTC_LIMITS.messageBytes} bytes`);
  }
  const frame = new Uint8Array(HEADER_BYTES + payload.byteLength);
  frame[0] = flags;
  new DataView(frame.buffer).setUint32(1, sequence >>> 0);
  frame.set(payload, HEADER_BYTES);
  return frame;
}

function decodeAppRtcFrame(frame: ArrayBuffer): { data: unknown; sequence: number } | null {
  if (frame.byteLength < HEADER_BYTES) return null;
  const view = new DataView(frame);
  const flags = view.getUint8(0);
  const sequence = view.getUint32(1);
  const payload = new Uint8Array(frame, HEADER_BYTES);
  if (flags & FLAG_BINARY) return { data: payload.slice().buffer, sequence };
  try {
    return { data: JSON.parse(decoder.decode(payload)), sequence };
  } catch {
    return null;
  }
}

const isNewerSequence = (next: number, last: number | null) =>
  last === null || (next !== last && ((next - last) >>> 0) < 0x8000_0000);

const publicationsKey = (members: readonly RealtimeRoomMember[]) =>
  members.map((member) => `${member.participantId}:${member.publications?.map((item) => item.id).join(",") ?? ""}`).join(";");

const GATHER_TIMEOUT_MS = 2_000;
const CONNECT_TIMEOUT_MS = 15_000;
const PENDING_RELIABLE_FRAMES = 256;
const LATEST_BACKLOG_BYTES = 64 * 1024;
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000, 30_000];
const RATE_LIMIT_RETRY_MS = 1_000;

class ConnectionReplacedError extends Error {
  constructor() {
    super("RTC connection was replaced");
    this.name = "ConnectionReplacedError";
  }
}

const policyOf = (delivery: AppRtcDelivery): RTCDataChannelInit =>
  delivery === "latest" ? { ordered: false, maxRetransmits: 0 } : { ordered: true };

const isSessionLost = (error: unknown) =>
  error instanceof HttpError && (error.code === "RTC_STALE" || error.code === "RTC_SESSION_NOT_FOUND");

const isRoomGone = (error: unknown) =>
  error instanceof HttpError && (error.code === "ROOM_NOT_FOUND" || error.code === "ROOM_EXPIRED");

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

type RemoteData = { name: string; participantId: string; publicationId: string; channel: RTCDataChannel; last: number | null };
type RemoteMedia = { participantId: string; publicationId: string; name: string; kind: AppRtcMediaKind; mid: string; track: MediaStreamTrack | null };

export class AppRtcChannel<T = unknown> {
  private readonly handlers = new Set<(message: AppRtcMessage<T>) => void>();
  private publication: { id: string; channel: RTCDataChannel } | null = null;
  private pending: Uint8Array[] = [];
  private sequence = 0;
  private closed = false;

  constructor(
    private readonly rtc: AppRoomRtc,
    readonly name: string,
    readonly delivery: AppRtcDelivery,
  ) {}

  send(data: T | ArrayBuffer | ArrayBufferView): boolean {
    if (this.closed || this.rtc.state === "closed") return false;
    this.sequence = (this.sequence + 1) >>> 0;
    const frame = encodeAppRtcFrame(data, this.sequence);
    const channel = this.publication?.channel;
    if (channel?.readyState === "open") return this.write(channel, frame);
    if (this.delivery === "latest") this.pending = [frame];
    else if (this.pending.length >= PENDING_RELIABLE_FRAMES) return false;
    else this.pending.push(frame);
    return true;
  }

  onMessage(handler: (message: AppRtcMessage<T>) => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.handlers.clear();
    this.pending = [];
    this.rtc.closeChannel(this as AppRtcChannel<unknown>);
  }

  /** @internal */
  get isOpen() {
    return !this.closed;
  }

  /** @internal */
  get publicationId() {
    return this.publication?.id ?? null;
  }

  /** @internal */
  attach(id: string, channel: RTCDataChannel) {
    this.publication = { id, channel };
    channel.binaryType = "arraybuffer";
    const flush = () => {
      const frames = this.pending;
      this.pending = [];
      for (const frame of frames) this.write(channel, frame);
    };
    if (channel.readyState === "open") flush();
    else channel.addEventListener("open", flush, { once: true });
  }

  /** @internal */
  detach() {
    this.publication = null;
  }

  /** @internal */
  fail() {
    this.close();
  }

  /** @internal */
  deliver(from: string, data: unknown) {
    for (const handler of this.handlers) handler({ from, data: data as T | ArrayBuffer });
  }

  private write(channel: RTCDataChannel, frame: Uint8Array) {
    if (this.delivery === "latest" && channel.bufferedAmount > LATEST_BACKLOG_BYTES) return false;
    try {
      channel.send(frame as Uint8Array<ArrayBuffer>);
      return true;
    } catch {
      return false;
    }
  }
}

export class AppRoomRtc {
  private _state: AppRtcState = "connecting";
  private pc: RTCPeerConnection | null = null;
  private sessionId: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private reconcileQueued = false;
  private reconcileFailures = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private readonly channels = new Map<string, AppRtcChannel<unknown>>();
  private readonly channelsToPublish = new Set<AppRtcChannel<unknown>>();
  private readonly remoteData = new Map<string, RemoteData>();
  private readonly localTracks = new Map<string, { track: MediaStreamTrack; kind: AppRtcMediaKind; transceiver: RTCRtpTransceiver | null; id: string | null }>();
  private readonly remoteMedia = new Map<string, RemoteMedia>();
  private readonly mediaByMid = new Map<string, string>();
  private readonly stateHandlers = new Set<(state: AppRtcState) => void>();
  private readonly trackHandlers = new Set<(tracks: AppRtcRemoteTrack[]) => void>();
  private readonly offMembers: () => void;

  constructor(private readonly host: AppRtcHost) {
    let published = "";
    this.offMembers = host.onMembersChanged((members) => {
      const next = publicationsKey(members);
      if (next === published) return;
      published = next;
      this.scheduleReconcile();
    });
  }

  get state() {
    return this._state;
  }

  get tracks(): AppRtcRemoteTrack[] {
    const tracks: AppRtcRemoteTrack[] = [];
    for (const item of this.remoteMedia.values()) {
      if (item.track) tracks.push({ participantId: item.participantId, name: item.name, kind: item.kind, track: item.track });
    }
    return tracks;
  }

  onStateChange(handler: (state: AppRtcState) => void) {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  onTracksChanged(handler: (tracks: AppRtcRemoteTrack[]) => void) {
    this.trackHandlers.add(handler);
    return () => this.trackHandlers.delete(handler);
  }

  channel<T = unknown>(name: string, options: AppRtcChannelOptions = {}): AppRtcChannel<T> {
    if (!isAppRtcName(name)) throw new Error(`invalid RTC channel name: ${name}`);
    const delivery = options.delivery ?? "reliable";
    const existing = this.channels.get(name);
    if (existing?.isOpen) {
      if (existing.delivery !== delivery) throw new Error(`RTC channel ${name} is already open with ${existing.delivery} delivery`);
      return existing as AppRtcChannel<T>;
    }
    if (this._state === "closed") throw new Error("RTC connection is closed");
    const channel = new AppRtcChannel<T>(this, name, delivery);
    this.channels.set(name, channel as AppRtcChannel<unknown>);
    this.publishChannel(channel as AppRtcChannel<unknown>);
    this.scheduleReconcile();
    return channel;
  }

  async publishTrack(track: MediaStreamTrack, options: { name: string }): Promise<AppRtcLocalTrack> {
    if (!isAppRtcName(options.name)) throw new Error(`invalid RTC track name: ${options.name}`);
    if (this.localTracks.has(options.name)) throw new Error(`RTC track ${options.name} is already published`);
    if (this.localTracks.size >= APP_RTC_LIMITS.tracksPerMember) throw new Error("RTC track limit reached");
    const kind = track.kind === "audio" ? "audio" : "video";
    const entry = { track, kind: kind as AppRtcMediaKind, transceiver: null, id: null };
    this.localTracks.set(options.name, entry);
    try {
      await this.enqueue(() => this.publishTracks([options.name]));
    } catch (error) {
      if (!(error instanceof ConnectionReplacedError)) {
        this.localTracks.delete(options.name);
        throw error;
      }
    }
    return {
      name: options.name,
      kind: entry.kind,
      track,
      stop: () => {
        const stopped = this.localTracks.get(options.name);
        if (stopped !== entry) return Promise.resolve();
        this.localTracks.delete(options.name);
        return this.enqueue(() => this.unpublishTrack(stopped)).catch((error) => {
          if (error instanceof ConnectionReplacedError) return;
          if (!this.localTracks.has(options.name)) this.localTracks.set(options.name, entry);
          throw error;
        });
      },
    };
  }

  async stats(): Promise<RtcTransportStats> {
    return this.pc ? readRtcTransportStats(await this.pc.getStats()) : { path: null, relayProtocol: null, rttMs: null };
  }

  close() {
    if (this._state === "closed") return;
    this.setState("closed");
    this.offMembers();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    for (const channel of this.channels.values()) channel.close();
    this.teardown(true);
  }

  /** @internal */
  async start() {
    await this.connect();
  }

  /** @internal */
  async verify() {
    if (this._state === "closed" || !this.sessionId) return;
    try {
      await this.request("GET", `/${this.sessionId}`);
    } catch (error) {
      if (isSessionLost(error)) this.reconnect();
    }
  }

  private publishChannel(channel: AppRtcChannel<unknown>) {
    this.channelsToPublish.add(channel);
    if (this.channelsToPublish.size > 1 || !this.pc) return;
    void this.enqueue(async () => {
      const batch = [...this.channelsToPublish];
      this.channelsToPublish.clear();
      try {
        await this.publishChannels(batch);
      } catch (error) {
        if (isSessionLost(error) || error instanceof ConnectionReplacedError) throw error;
        if (error instanceof HttpError && error.code === "RTC_RATE_LIMITED") {
          setTimeout(() => {
            for (const item of batch) if (item.isOpen) this.publishChannel(item);
          }, RATE_LIMIT_RETRY_MS);
          return;
        }
        for (const item of batch) item.fail();
        console.warn("[Cohub AppRtc] failed to publish channels", error);
      }
    }).catch(() => undefined);
  }

  /** @internal */
  closeChannel(channel: AppRtcChannel<unknown>) {
    if (this.channels.get(channel.name) === channel) this.channels.delete(channel.name);
    const id = channel.publicationId;
    channel.detach();
    if (id) void this.enqueue(() => this.unpublishData([id])).catch(() => undefined);
    this.scheduleReconcile();
  }

  private async connect() {
    const generation = ++this.generation;
    const opened = await this.send<AppRtcOpenResponse>("POST", "", {
      ticket: this.host.ticket,
      participantId: this.host.participantId(),
    });
    if (generation !== this.generation || this._state === "closed") {
      void this.send("DELETE", `/${opened.sessionId}`).catch(() => undefined);
      return;
    }
    const pc = new RTCPeerConnection({ iceServers: opened.iceServers, bundlePolicy: "max-bundle" });
    this.pc = pc;
    this.sessionId = opened.sessionId;
    pc.addEventListener("connectionstatechange", () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === "connected") {
        this.reconnectAttempt = 0;
        this.setState("connected");
      } else if (pc.connectionState === "failed") {
        this.reconnect();
      }
    });
    pc.addEventListener("track", (event) => this.onTrack(event));
    pc.addEventListener("datachannel", () => undefined);

    const ready = (async () => {
      await this.answerOffer(opened.offer);
      await this.connected(pc);
    })();
    this.queue = ready.catch(() => undefined);
    try {
      await ready;
    } catch (error) {
      if (generation === this.generation) this.reconnect();
      throw error;
    }
    this.channelsToPublish.clear();
    const republish = [...this.channels.values()].filter((channel) => channel.isOpen);
    const tracks = [...this.localTracks.keys()];
    await Promise.all([
      republish.length
        ? this.enqueue(() => this.publishChannels(republish)).catch((error) => {
            if (error instanceof ConnectionReplacedError || isSessionLost(error)) return;
            for (const channel of republish) channel.fail();
            console.warn("[Cohub AppRtc] failed to publish channels on the new connection", error);
          })
        : null,
      tracks.length
        ? this.enqueue(() => this.publishTracks(tracks)).catch((error) => {
            if (error instanceof ConnectionReplacedError || isSessionLost(error)) return;
            console.warn("[Cohub AppRtc] failed to publish tracks on the new connection", error);
          })
        : null,
    ]);
    this.scheduleReconcile();
  }

  private connected(pc: RTCPeerConnection) {
    if (pc.connectionState === "connected") return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => done(new Error("RTC connection timed out")), CONNECT_TIMEOUT_MS);
      const done = (error?: Error) => {
        clearTimeout(timer);
        pc.removeEventListener("connectionstatechange", check);
        if (error) reject(error);
        else resolve();
      };
      const check = () => {
        if (pc.connectionState === "connected") done();
        else if (pc.connectionState === "failed" || pc.connectionState === "closed") done(new Error("RTC connection failed"));
      };
      pc.addEventListener("connectionstatechange", check);
    });
  }

  private reconnect() {
    if (this._state === "closed" || this.reconnectTimer) return;
    this.setState(this._state === "connecting" ? "connecting" : "reconnecting");
    this.teardown(true);
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ?? 30_000;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch((error) => {
        if (isRoomGone(error) || (error instanceof HttpError && (error.status === 403 || error.status === 503))) this.close();
        else this.reconnect();
      });
    }, delay);
  }

  private teardown(release: boolean) {
    this.generation += 1;
    const sessionId = this.sessionId;
    this.sessionId = null;
    this.queue = Promise.resolve();
    for (const channel of this.channels.values()) channel.detach();
    for (const item of this.remoteData.values()) item.channel.close();
    this.remoteData.clear();
    for (const item of this.localTracks.values()) {
      item.transceiver = null;
      item.id = null;
    }
    const hadTracks = this.remoteMedia.size > 0;
    this.remoteMedia.clear();
    this.mediaByMid.clear();
    this.pc?.close();
    this.pc = null;
    if (hadTracks) this.notifyTracks();
    if (release && sessionId) void this.send("DELETE", `/${sessionId}`).catch(() => undefined);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const generation = this.generation;
    const run = async () => {
      if (generation !== this.generation || !this.pc || !this.sessionId) throw new ConnectionReplacedError();
      try {
        return await operation();
      } catch (error) {
        if (isSessionLost(error)) this.reconnect();
        throw error;
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async publishChannels(channels: AppRtcChannel<unknown>[]) {
    const pc = this.requirePc();
    const open = channels.filter((channel) => channel.isOpen && !channel.publicationId);
    if (open.length === 0) return;
    const result = await this.request<AppRtcPublishResponse>("POST", `/${this.sessionId}/publish`, {
      channels: open.map((channel) => ({ name: channel.name, delivery: channel.delivery })),
    });
    for (const publication of result.publications) {
      const channel = open.find((item) => item.name === publication.name);
      const id = result.channelIds?.[publication.id];
      if (!channel || id === undefined) continue;
      const dataChannel = pc.createDataChannel(publication.name, { negotiated: true, id, ...policyOf(channel.delivery) });
      channel.attach(publication.id, dataChannel);
      if (!channel.isOpen) await this.unpublishData([publication.id]);
    }
  }

  private async unpublishData(ids: string[]) {
    await this.request<AppRtcUnpublishResponse>("POST", `/${this.sessionId}/unpublish`, { ids });
  }

  private async publishTracks(names: string[]) {
    const pc = this.requirePc();
    const entries = names.flatMap((name) => {
      const entry = this.localTracks.get(name);
      return entry && !entry.id ? [{ name, entry }] : [];
    });
    if (entries.length === 0) return;
    for (const { entry } of entries) entry.transceiver = pc.addTransceiver(entry.track, { direction: "sendonly" });
    const offer = await this.localOffer(pc);
    let result: AppRtcPublishResponse;
    try {
      result = await this.request<AppRtcPublishResponse>("POST", `/${this.sessionId}/publish`, {
        offer,
        tracks: entries.map(({ name, entry }) => ({ name, kind: entry.kind, mid: entry.transceiver?.mid ?? "" })),
      });
    } catch (error) {
      if (error instanceof ConnectionReplacedError) throw error;
      await this.settleOffer(pc, undefined).catch(() => undefined);
      for (const { entry } of entries) {
        entry.transceiver?.stop();
        entry.transceiver = null;
      }
      throw error;
    }
    await this.settleOffer(pc, result.answer);
    for (const publication of result.publications) {
      const item = entries.find((candidate) => candidate.name === publication.name);
      if (item) item.entry.id = publication.id;
    }
  }

  private async unpublishTrack(entry: { transceiver: RTCRtpTransceiver | null; id: string | null }) {
    if (!entry.id || !entry.transceiver || !this.pc) return;
    const id = entry.id;
    entry.transceiver.stop();
    await this.offerExchange(this.pc, (offer) =>
      this.request<AppRtcUnpublishResponse>("POST", `/${this.sessionId}/unpublish`, { ids: [id], offer }),
    );
    entry.id = null;
  }

  private async settleOffer(pc: RTCPeerConnection, answer: SessionDescription | undefined) {
    if (answer) await pc.setRemoteDescription(answer);
    else if (pc.signalingState === "have-local-offer") await pc.setLocalDescription({ type: "rollback" });
  }

  private async offerExchange(pc: RTCPeerConnection, send: (offer: SessionDescription) => Promise<{ answer?: SessionDescription }>) {
    const offer = await this.localOffer(pc);
    let answer: SessionDescription | undefined;
    try {
      ({ answer } = await send(offer));
    } catch (error) {
      if (!(error instanceof ConnectionReplacedError)) await this.settleOffer(pc, undefined).catch(() => undefined);
      throw error;
    }
    await this.settleOffer(pc, answer);
  }

  private scheduleReconcile() {
    if (this.reconcileQueued || !this.pc || this._state === "closed") return;
    this.reconcileQueued = true;
    void this.enqueue(async () => {
      this.reconcileQueued = false;
      await this.reconcile();
      this.reconcileFailures = 0;
    }).catch((error) => {
      this.reconcileQueued = false;
      if (isSessionLost(error) || error instanceof ConnectionReplacedError) return;
      console.warn("[Cohub AppRtc] failed to update subscriptions", error);
      if (error instanceof HttpError && error.code === "RTC_LIMIT_EXCEEDED") return;
      const delay = RECONNECT_DELAYS_MS[Math.min(this.reconcileFailures, RECONNECT_DELAYS_MS.length - 1)] ?? 30_000;
      this.reconcileFailures += 1;
      const generation = this.generation;
      setTimeout(() => {
        if (generation === this.generation) this.scheduleReconcile();
      }, delay);
    });
  }

  private async reconcile() {
    const self = this.host.participantId();
    const wantedData = new Map<string, AppRtcSubscriptionRef & { name: string; delivery: AppRtcDelivery }>();
    const wantedMedia = new Map<string, AppRtcSubscriptionRef & { name: string; kind: AppRtcMediaKind }>();
    for (const member of this.host.members()) {
      if (member.participantId === self) continue;
      for (const publication of member.publications ?? []) {
        const key = `${member.participantId}:${publication.id}`;
        const ref = { participantId: member.participantId, publicationId: publication.id };
        if (publication.kind === "data") {
          const channel = this.channels.get(publication.name);
          if (channel?.isOpen && channel.delivery === (publication.delivery ?? "reliable")) {
            wantedData.set(key, { ...ref, name: publication.name, delivery: channel.delivery });
          }
        } else if (wantedMedia.size < APP_RTC_LIMITS.mediaSubscriptions) {
          wantedMedia.set(key, { ...ref, name: publication.name, kind: publication.kind });
        }
      }
    }
    await this.reconcileData(wantedData);
    await this.reconcileMedia(wantedMedia);
  }

  private async reconcileData(wanted: Map<string, AppRtcSubscriptionRef & { name: string; delivery: AppRtcDelivery }>) {
    const pc = this.requirePc();
    const stale = [...this.remoteData].filter(([key]) => !wanted.has(key));
    for (const batch of chunk(stale, APP_RTC_LIMITS.batch)) {
      await this.request<AppRtcUnsubscribeResponse>("POST", `/${this.sessionId}/unsubscribe`, {
        items: batch.map(([, item]) => ({ participantId: item.participantId, publicationId: item.publicationId })),
      });
      for (const [key, item] of batch) {
        item.channel.close();
        this.remoteData.delete(key);
      }
    }
    const missing = [...wanted].filter(([key]) => !this.remoteData.has(key)).map(([, item]) => item);
    for (const batch of chunk(missing, APP_RTC_LIMITS.batch)) {
      const result = await this.request<AppRtcSubscribeResponse>("POST", `/${this.sessionId}/subscribe`, {
        kind: "data",
        items: batch.map(({ participantId, publicationId }) => ({ participantId, publicationId })),
      });
      for (const subscription of result.subscriptions) {
        const item = batch.find((entry) => entry.participantId === subscription.participantId && entry.publicationId === subscription.publicationId);
        if (!item || subscription.channelId === undefined) continue;
        const channel = pc.createDataChannel(item.name, { negotiated: true, id: subscription.channelId, ...policyOf(item.delivery) });
        channel.binaryType = "arraybuffer";
        const remote: RemoteData = { name: item.name, participantId: item.participantId, publicationId: item.publicationId, channel, last: null };
        channel.addEventListener("message", (event) => this.onData(remote, event.data));
        this.remoteData.set(`${item.participantId}:${item.publicationId}`, remote);
      }
    }
  }

  private async reconcileMedia(wanted: Map<string, AppRtcSubscriptionRef & { name: string; kind: AppRtcMediaKind }>) {
    const pc = this.requirePc();
    const stale = [...this.remoteMedia].filter(([key]) => !wanted.has(key));
    if (stale.length) {
      for (const [, item] of stale) {
        pc.getTransceivers().find((transceiver) => transceiver.mid === item.mid)?.stop();
        item.track = null;
      }
      this.notifyTracks();
      await this.offerExchange(pc, (offer) =>
        this.request<AppRtcUnsubscribeResponse>("POST", `/${this.sessionId}/unsubscribe`, {
          items: stale.map(([, item]) => ({ participantId: item.participantId, publicationId: item.publicationId })),
          offer,
        }),
      );
      for (const [key, item] of stale) {
        this.remoteMedia.delete(key);
        this.mediaByMid.delete(item.mid);
      }
    }
    const missing = [...wanted].filter(([key]) => !this.remoteMedia.has(key)).map(([, item]) => item);
    if (missing.length === 0) return;
    const result = await this.request<AppRtcSubscribeResponse>("POST", `/${this.sessionId}/subscribe`, {
      kind: "media",
      items: missing.map(({ participantId, publicationId }) => ({ participantId, publicationId })),
    });
    for (const subscription of result.subscriptions) {
      const item = missing.find((entry) => entry.participantId === subscription.participantId && entry.publicationId === subscription.publicationId);
      if (!item || !subscription.mid) continue;
      const key = `${item.participantId}:${item.publicationId}`;
      this.remoteMedia.set(key, { ...item, mid: subscription.mid, track: null });
      this.mediaByMid.set(subscription.mid, key);
    }
    if (!result.offer) return;
    try {
      await this.answerOffer(result.offer);
    } catch (error) {
      if (!(error instanceof ConnectionReplacedError)) this.reconnect();
      throw error;
    }
  }

  private async answerOffer(offer: SessionDescription) {
    const pc = this.requirePc();
    await pc.setRemoteDescription(offer);
    await pc.setLocalDescription(await pc.createAnswer());
    await waitForIceGathering(pc, GATHER_TIMEOUT_MS);
    const answer = pc.localDescription;
    if (!answer) throw new Error("the browser produced no answer");
    await this.request("PUT", `/${this.sessionId}`, { answer: { type: "answer", sdp: answer.sdp } });
  }

  private async localOffer(pc: RTCPeerConnection): Promise<SessionDescription> {
    await pc.setLocalDescription(await pc.createOffer());
    await waitForIceGathering(pc, GATHER_TIMEOUT_MS);
    const offer = pc.localDescription;
    if (!offer) throw new Error("the browser produced no offer");
    return { type: "offer", sdp: offer.sdp };
  }

  // Drops responses that arrive after their connection was replaced.
  private async request<T = unknown>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
    const generation = this.generation;
    const settled = await this.send<T>(method, path, body).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    if (generation !== this.generation) throw new ConnectionReplacedError();
    if ("error" in settled) throw settled.error;
    return settled.value;
  }

  private send<T = unknown>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
    const url = `/api/apps/${encodeURIComponent(this.host.appId)}/realtime/rooms/${encodeURIComponent(this.host.roomId)}/rtc${path}`;
    return this.host.transport.request<T>(url, {
      method,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
  }

  private requirePc() {
    if (!this.pc || !this.sessionId) throw new ConnectionReplacedError();
    return this.pc;
  }

  private onData(remote: RemoteData, raw: unknown) {
    if (!(raw instanceof ArrayBuffer)) return;
    const frame = decodeAppRtcFrame(raw);
    if (!frame) return;
    const channel = this.channels.get(remote.name);
    if (!channel?.isOpen) return;
    if (channel.delivery === "latest") {
      if (!isNewerSequence(frame.sequence, remote.last)) return;
      remote.last = frame.sequence;
    }
    channel.deliver(remote.participantId, frame.data);
  }

  private onTrack(event: RTCTrackEvent) {
    const key = event.transceiver.mid ? this.mediaByMid.get(event.transceiver.mid) : undefined;
    const item = key ? this.remoteMedia.get(key) : undefined;
    if (!item) return;
    item.track = event.track;
    event.track.addEventListener("ended", () => {
      if (this.remoteMedia.get(key ?? "") === item) {
        item.track = null;
        this.notifyTracks();
      }
    });
    this.notifyTracks();
  }

  private notifyTracks() {
    const tracks = this.tracks;
    for (const handler of this.trackHandlers) handler(tracks);
  }

  private setState(state: AppRtcState) {
    if (this._state === state) return;
    this._state = state;
    for (const handler of this.stateHandlers) handler(state);
  }
}
