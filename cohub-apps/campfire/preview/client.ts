import type { CohubClient, RealtimeRoomMember } from "@neta-art/cohub";

type Wire =
  | { kind: "hello"; member: RealtimeRoomMember }
  | { kind: "member"; member: RealtimeRoomMember }
  | { kind: "bye"; participantId: string }
  | { kind: "event"; event: StoredEvent };

type StoredEvent = { id: string; type: string; data: unknown; timestamp: number; sequence: number; sender: { participantId: string }; kept: boolean };

const historyKey = (code: string) => `campfire.preview.history.${code}`;

class PreviewRoom {
  readonly id: string;
  readonly code: string;
  readonly participantId = crypto.randomUUID();
  private readonly channel: BroadcastChannel;
  private readonly roster = new Map<string, RealtimeRoomMember>();
  private readonly listeners = new Set<(event: StoredEvent & { self: boolean }) => void>();
  private readonly memberListeners = new Set<(members: RealtimeRoomMember[]) => void>();
  private spiritTimer: ReturnType<typeof setInterval> | null = null;
  private sequence = 0;
  private readonly spiritId = crypto.randomUUID();

  constructor(code: string) {
    this.code = code;
    this.id = `preview-${code}`;
    this.channel = new BroadcastChannel(`campfire.preview.${code}`);
    this.channel.onmessage = ({ data }: MessageEvent<Wire>) => this.receive(data);
    this.roster.set(this.participantId, this.self(null));
    this.channel.postMessage({ kind: "hello", member: this.self(null) } satisfies Wire);
    addEventListener("pagehide", () => this.channel.postMessage({ kind: "bye", participantId: this.participantId } satisfies Wire));
  }

  private self(presence: Record<string, unknown> | null): RealtimeRoomMember {
    const existing = this.roster.get(this.participantId);
    return { participantId: this.participantId, joinedAt: existing?.joinedAt ?? new Date().toISOString(), presence, kind: "user" };
  }

  private receive(wire: Wire) {
    if (wire.kind === "hello") {
      this.roster.set(wire.member.participantId, wire.member);
      const self = this.roster.get(this.participantId);
      if (self) this.channel.postMessage({ kind: "member", member: self } satisfies Wire);
    } else if (wire.kind === "member") {
      this.roster.set(wire.member.participantId, wire.member);
    } else if (wire.kind === "bye") {
      this.roster.delete(wire.participantId);
    } else {
      this.deliver(wire.event, false);
      return;
    }
    this.announce();
  }

  private announce() {
    const list = this.list();
    for (const listener of this.memberListeners) listener(list);
  }

  private list() {
    return [...this.roster.values()];
  }

  private emit(type: string, data: unknown, kept: boolean, sender: string = this.participantId) {
    const event: StoredEvent = { id: crypto.randomUUID(), type, data, timestamp: Date.now(), sequence: 0, sender: { participantId: sender as RealtimeRoomMember["participantId"] }, kept };
    if (kept) {
      const history = JSON.parse(localStorage.getItem(historyKey(this.code)) ?? "[]") as StoredEvent[];
      localStorage.setItem(historyKey(this.code), JSON.stringify([...history, event].slice(-400)));
    }
    this.channel.postMessage({ kind: "event", event } satisfies Wire);
    this.deliver(event, sender === this.participantId);
    if (type === "spirit.summon" && sender === this.participantId) this.summonSpirit();
    if (type === "spirit.dismiss") this.dismissSpirit();
  }

  private deliver(event: StoredEvent, self: boolean) {
    this.sequence += 1;
    for (const listener of this.listeners) listener({ ...event, sequence: this.sequence, self });
  }

  private summonSpirit() {
    const spiritId = this.spiritId;
    const spirit: RealtimeRoomMember = {
      participantId: spiritId,
      joinedAt: new Date().toISOString(),
      kind: "cli",
      presence: { role: "spirit", name: "Ember", color: "#ffb36b", thinking: true },
    };
    this.roster.set(spiritId, spirit);
    this.channel.postMessage({ kind: "member", member: spirit } satisfies Wire);
    this.announce();
    const lines = [
      "Someone finally fed me. Sit closer, the night is long and I remember most of it.",
      "A traveller once sat where you are sitting. She carried a lantern with no flame in it, and never said why.",
      "Listen to the grass. It only whispers when the fire is low.",
    ];
    let index = 0;
    const think = (thinking: boolean) => {
      const member = { ...spirit, presence: { ...spirit.presence, thinking } };
      this.roster.set(spiritId, member);
      this.channel.postMessage({ kind: "member", member } satisfies Wire);
      this.announce();
    };
    const say = () => {
      think(true);
      setTimeout(() => {
        const text = lines[index % lines.length] ?? "";
        index += 1;
        think(false);
        this.emit("spirit.speak", { id: `line-${index}`, text, name: "Ember", story: index > 1 }, true, spiritId);
      }, 1800);
    };
    say();
    this.spiritTimer = setInterval(say, 16_000);
  }

  private dismissSpirit() {
    if (this.spiritTimer) clearInterval(this.spiritTimer);
    this.spiritTimer = null;
    const spirit = this.list().find((member) => member.presence?.role === "spirit");
    if (!spirit) return;
    this.emit("spirit.gone", { reason: "dismissed" }, true, spirit.participantId);
    this.roster.delete(spirit.participantId);
    this.channel.postMessage({ kind: "bye", participantId: spirit.participantId } satisfies Wire);
    this.announce();
  }

  get members() {
    return this.list();
  }

  subscribeAll(listener: (event: StoredEvent & { self: boolean }) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onMembersChanged(listener: (members: RealtimeRoomMember[]) => void) {
    this.memberListeners.add(listener);
    return () => this.memberListeners.delete(listener);
  }

  onStateChange() {
    return () => true;
  }

  onOutOfSync() {
    return () => true;
  }

  async setPresence(presence: Record<string, unknown> | null) {
    const member = this.self(presence);
    this.roster.set(this.participantId, member);
    this.channel.postMessage({ kind: "member", member } satisfies Wire);
    this.announce();
  }

  async publish(type: string, data: unknown) {
    this.emit(type, data, true);
  }

  send(type: string, data: unknown) {
    this.emit(type, data, false);
  }

  async history({ after = 0 }: { after?: number; limit?: number } = {}) {
    if (after > 0) return { events: [], cursor: after, truncated: false };
    const history = JSON.parse(localStorage.getItem(historyKey(this.code)) ?? "[]") as StoredEvent[];
    const events = history.map((event, index) => ({ ...event, sequence: index + 1, self: event.sender.participantId === this.participantId }));
    this.sequence = Math.max(this.sequence, events.length);
    return { events, cursor: events.length, truncated: false };
  }

  async invite() {
    return { invite: `preview-invite-${this.code}`, expiresAt: new Date(Date.now() + 900_000).toISOString() };
  }

  async rtc(): Promise<never> {
    throw Object.assign(new Error("No WebRTC relay in the preview"), { code: "RTC_UNAVAILABLE" });
  }

  async leave() {
    this.channel.postMessage({ kind: "bye", participantId: this.participantId } satisfies Wire);
    this.channel.close();
  }
}

const zh = new URLSearchParams(location.search).get("lang") === "zh";

export const createPreviewClient = (): CohubClient => {
  const rooms = new Map<string, PreviewRoom>();
  const room = async ({ code }: { code: string }) => {
    const existing = rooms.get(code) ?? new PreviewRoom(code);
    rooms.set(code, existing);
    return existing;
  };
  const client = {
    context: async () => ({
      app: { id: "preview", slug: "campfire", url: `${location.origin}/preview.html`, homeSpace: { id: "preview-space" } },
      space: { id: "preview-space" },
      viewer: { userUuid: "preview" },
      shell: { surface: "workspace", space: { id: "preview-space" }, session: null, turn: null },
      locale: zh ? "zh-CN" : "en",
      appearance: { colorScheme: "dark", theme: "dark", tokens: {}, reducedMotion: false },
      window: { visible: true },
    }),
    app: {
      appearance: { sync: () => () => undefined },
      onContextChanged: () => () => undefined,
      window: { setState: () => undefined },
      devices: { request: async () => "granted" as const },
      actions: { run: async () => ({ taskRunId: "preview", action: "spirit", status: "pending" as const }) },
      realtime: { joinRoom: room, createRoom: room },
    },
  };
  return client as unknown as CohubClient;
};
