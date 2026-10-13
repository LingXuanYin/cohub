import { type AppRuntimeContext, type CohubClient, createCohubClient } from "@neta-art/cohub";
import { localeKeyFor, messageFor, type Messages } from "./i18n";
import { readIntent, readProfile, readTabValue, writeIntent, writeProfile, writeTabValue, type Intent } from "./intent";
import { Media } from "./media.svelte";
import { Meadow } from "./meadow";
import { type Connection, FireSession, type Member, type RoomLogEvent } from "./net";
import { createTrack, lerpAngle, pushSample, RENDER_DELAY_MS, sampleTrack, type PoseTrack } from "./pose";
import {
  EMBER_COOLDOWN_MS,
  LIVE_WINDOW_MS,
  MEADOW_RADIUS,
  roomEvents,
  type ChatData,
  type EmberData,
} from "./protocol";
import { normalizeCode, randomCode, spaceCode } from "./room-code";
import { Sketch } from "./sketch.svelte";
import { Spirit } from "./spirit.svelte";
import type { Locale } from "./words";

export type Phase = "boot" | "lobby" | "joining" | "fire" | "broken";

export type LogLine = {
  id: string;
  kind: "chat" | "spirit" | "ember" | "game";
  name: string;
  text: string;
  at: number;
};

export type SitInput = { name: string; color: string; code: string; listen: boolean };

const LOG_LIMIT = 160;
const PRESENCE_INTERVAL_MS = 2500;
const NOTICE_MS = 6000;

const isDev = () => location.hostname.includes("dev") || location.pathname.startsWith("/dev/");

export class Campfire {
  readonly client: CohubClient;
  readonly meadow = new Meadow();
  readonly media = new Media(this);
  readonly spirit = new Spirit(this);
  readonly sketch = new Sketch(this);

  phase = $state<Phase>("boot");
  context = $state.raw<AppRuntimeContext | null>(null);
  locale = $state<Locale>("en");
  t = $state.raw<Messages>(messageFor("en"));
  bootError = $state<string | null>(null);
  joinError = $state<string | null>(null);
  code = $state("");
  linked = $state(false);
  profile = readProfile();

  members = $state.raw<Member[]>([]);
  connection = $state.raw<Connection>({ transport: "connecting", rttMs: null, path: null });
  notice = $state<string | null>(null);
  log = $state.raw<LogLine[]>([]);
  frame = $state(0);
  clock = $state(Date.now());
  emberReadyAt = $state(0);

  session: FireSession | null = null;

  readonly me = $derived(this.members.find((member) => member.self) ?? null);
  readonly people = $derived(this.members.filter((member) => !member.spirit));
  readonly names = $derived(new Map(this.members.map((member) => [member.participantId, member.name || this.t.traveler])));
  readonly keeper = $derived(
    [...this.members].filter((member) => member.kind === "user").sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0]?.self === true,
  );

  private readonly poses = new Map<string, PoseTrack>();
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private contextOff: (() => void) | null = null;
  private loopOff: (() => void) | null = null;
  private presenceAt = Number.NEGATIVE_INFINITY;
  private presenceKey = "";

  constructor(client?: CohubClient) {
    this.client = client ?? createCohubClient({ env: isDev() ? "dev" : "prod" });
  }

  async boot() {
    try {
      const context = await this.client.context();
      if (!context?.app?.id) throw new Error("Open Campfire inside Cohub to sit by a fire.");
      this.applyContext(context);
      this.client.app.appearance.sync();
      this.contextOff = this.client.app.onContextChanged((next) => this.applyContext(next));

      const linked = normalizeCode(new URLSearchParams(location.search).get("room"));
      this.code = linked ?? normalizeCode(readTabValue("room")) ?? spaceCode(seedOf(context));
      this.linked = Boolean(linked);

      if (innerWidth > 640) this.meadow.camera = { x: -Math.min(9, innerWidth / 160), y: -0.5 };
      else this.meadow.camera = { x: 0, y: 6 };

      const intent = readIntent();
      writeIntent(null);
      if (intent) {
        this.code = intent.code;
        await this.enter(intent);
        return;
      }
      this.phase = "lobby";
    } catch (error) {
      this.bootError = messageOf(error);
      this.phase = "broken";
    }
  }

  private applyContext(context: AppRuntimeContext) {
    this.context = context;
    const locale = localeKeyFor(context.locale);
    if (locale !== this.locale || this.phase === "boot") {
      this.locale = locale;
      this.t = messageFor(context.locale);
    }
    this.meadow.reducedMotion = context.appearance?.reducedMotion ?? false;
    this.meadow.setVisible(context.window?.visible !== false);
  }

  async sit(input: SitInput) {
    const code = normalizeCode(input.code);
    if (!code) {
      this.joinError = this.t.codeInvalid;
      return;
    }
    this.joinError = null;
    this.code = code;
    writeProfile({ name: input.name, color: input.color });
    this.profile = { name: input.name, color: input.color };
    const spot = spawnPoint();
    await this.enter({ code, name: input.name, color: input.color, mic: !input.listen, cam: false, x: spot.x, y: spot.y, at: Date.now() });
  }

  /** A signed-out visitor gets a sentence, not the API's bare word for it. */
  private sitFailed(error: unknown) {
    const status = (error as { status?: number }).status;
    if (status === 401 || /unauthor|forbidden/i.test(messageOf(error))) return this.t.signIn;
    return messageOf(error);
  }

  private async enter(intent: Intent) {
    this.phase = "joining";
    writeTabValue("room", intent.code);
    const spot = intent.x || intent.y ? { x: intent.x, y: intent.y } : spawnPoint();
    const session = new FireSession(
      this.client,
      intent.code,
      { name: intent.name, color: intent.color, playing: false, mic: false, cam: false, screen: false, x: spot.x, y: spot.y },
      {
        onMembers: (members) => {
          this.members = members;
          this.syncBodies();
        },
        onTracks: (tracks) => this.media.onTracks(tracks),
        onConnection: (connection) => {
          const wasPeer = this.connection.transport === "peer";
          this.connection = connection;
          if (connection.transport === "peer" && !wasPeer) void this.media.publishPending();
        },
        onEvent: (event) => this.route(event),
        onPose: (participantId, pose) => {
          const track = this.poses.get(participantId) ?? createTrack();
          pushSample(track, performance.now(), pose);
          this.poses.set(participantId, track);
        },
        onEmote: (participantId, emote) => this.meadow.emote(participantId, emote.emoji),
        onInk: (participantId, ops) => this.sketch.receiveInk(participantId, ops),
        onReset: () => {
          this.log = [];
          this.meadow.emberTimes = [];
          this.sketch.reset();
          this.spirit.reset();
          this.say(this.t.historyTrimmed);
        },
        onNotice: (kind) => this.say(kind === "reconnecting" ? this.t.reconnecting : this.t.voicesDown),
        planMedia: (candidates) => this.media.plan(candidates),
      },
    );
    this.session = session;
    this.meadow.actor("self", { name: intent.name, color: intent.color, kind: "user", spirit: false, self: true, x: spot.x, y: spot.y });
    this.meadow.frame(spot.x, spot.y);
    try {
      await session.join();
    } catch (error) {
      session.dispose();
      this.session = null;
      this.meadow.actors.clear();
      this.joinError = this.sitFailed(error);
      this.phase = "lobby";
      return;
    }
    this.rekeySelf(session.participantId);
    this.phase = "fire";
    this.client.app.window.setState({ title: `${this.t.title} · ${intent.code}` });
    this.startLoops();
    await this.media.start({ mic: intent.mic, cam: intent.cam });
    if (!readTabValue("hinted")) {
      writeTabValue("hinted", "1");
      this.say(this.t.walkHint);
    }
  }

  async leave() {
    writeIntent(null);
    this.loopOff?.();
    this.loopOff = null;
    this.media.stop();
    this.sketch.reset();
    this.spirit.reset();
    await this.session?.leave();
    this.session = null;
    this.members = [];
    this.log = [];
    this.poses.clear();
    this.meadow.actors.clear();
    this.meadow.emberTimes = [];
    this.meadow.bubbles = [];
    this.phase = "lobby";
  }

  remember(patch: Partial<Intent> = {}) {
    const me = this.me;
    const body = this.meadow.self();
    writeIntent({
      code: this.code,
      name: me?.name ?? this.profile?.name ?? "",
      color: me?.color ?? this.profile?.color ?? "#f4a261",
      mic: this.media.mic,
      cam: this.media.cam,
      x: body?.x ?? 0,
      y: body?.y ?? 0,
      at: Date.now(),
      ...patch,
    });
  }

  forget() {
    writeIntent(null);
  }

  newCode() {
    this.code = randomCode();
    this.linked = false;
  }

  async feed() {
    if (!this.session || Date.now() < this.emberReadyAt) return;
    this.emberReadyAt = Date.now() + EMBER_COOLDOWN_MS;
    try {
      await this.session.publish(roomEvents.ember, { name: this.me?.name ?? "" } satisfies EmberData);
    } catch {
      this.emberReadyAt = 0;
      this.say(this.t.sendFailed);
    }
  }

  react(emoji: string) {
    const body = this.meadow.self();
    if (body) this.meadow.emote(body.participantId, emoji);
    this.session?.sendEmote({ emoji });
  }

  async chat(text: string, toSpirit: boolean) {
    const line = text.trim().slice(0, 240);
    if (!line || !this.session) return false;
    try {
      await this.session.publish(roomEvents.chat, { text: line, name: this.me?.name ?? "", toSpirit: toSpirit || undefined } satisfies ChatData);
      return true;
    } catch {
      this.say(this.t.sendFailed);
      return false;
    }
  }

  async copyLink() {
    const base = this.context?.app.url ?? `${location.origin}${location.pathname}`;
    await this.copy(`${base}?room=${encodeURIComponent(this.code)}`, this.t.linkCopied);
  }

  async copyInvite() {
    const invite = await this.session?.invite().catch(() => null);
    if (!invite) return this.say(this.t.inviteFailed);
    await this.copy(`cohub rooms join ${invite.invite}`, this.t.inviteCopied);
  }

  private async copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.say(done);
    } catch {
      this.say(text);
    }
  }

  say(text: string) {
    this.notice = text;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      if (this.notice === text) this.notice = null;
    }, NOTICE_MS);
  }

  private route(event: RoomLogEvent) {
    if (event.type.startsWith("sketch.")) return this.sketch.handle(event);
    if (event.type.startsWith("spirit.")) return this.spirit.handle(event);
    const live = Date.now() - event.at < LIVE_WINDOW_MS;
    if (event.type === roomEvents.ember) {
      const data = event.data as Partial<EmberData>;
      this.meadow.addEmber(event.at);
      if (live) this.meadow.motes.spawn(18, this.meadow.warmth + 2);
      this.append({ id: `${event.sequence}`, kind: "ember", name: String(data?.name ?? ""), text: "", at: event.at });
    } else if (event.type === roomEvents.chat) {
      const data = event.data as Partial<ChatData>;
      if (typeof data?.text !== "string") return;
      const name = String(data.name ?? "");
      if (live) this.meadow.say(event.participantId, data.text);
      this.append({ id: `${event.sequence}`, kind: "chat", name, text: data.text, at: event.at });
    }
  }

  append(line: LogLine) {
    const next = [...this.log, line];
    this.log = next.length > LOG_LIMIT ? next.slice(-LOG_LIMIT) : next;
  }

  private startLoops() {
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.meadow.step(dt, now);
      this.followBodies(now);
      this.media.frame();
      this.sendPose();
      if (this.meadow.visibleNow) this.frame += 1;
    };
    raf = requestAnimationFrame(tick);
    const seconds = setInterval(() => {
      this.clock = Date.now();
      this.sketch.tick();
      this.spirit.tick();
      this.pushPresence();
    }, 1000);
    this.loopOff = () => {
      cancelAnimationFrame(raf);
      clearInterval(seconds);
    };
  }

  private followBodies(now: number) {
    const at = now - RENDER_DELAY_MS;
    for (const actor of this.meadow.actors.values()) {
      if (actor.self || actor.spirit) continue;
      const track = this.poses.get(actor.participantId);
      const pose = track ? sampleTrack(track, at) : null;
      if (pose) {
        actor.live = true;
        actor.x = pose.x;
        actor.y = pose.y;
        actor.angle = pose.angle;
        actor.reportedLevel = pose.level;
        actor.talking = pose.talking;
        actor.moving = pose.moving;
      } else {
        actor.x += (actor.targetX - actor.x) * 0.08;
        actor.y += (actor.targetY - actor.y) * 0.08;
        if (Math.abs(actor.targetX - actor.x) > 0.01) actor.angle = lerpAngle(actor.angle, Math.atan2(actor.targetY - actor.y, actor.targetX - actor.x), 0.2);
      }
    }
  }

  private sendPose() {
    const body = this.meadow.self();
    if (!body || !this.session) return;
    const level = this.media.level;
    this.session.sendPose({
      x: body.x,
      y: body.y,
      angle: body.angle,
      level,
      moving: body.moving,
      talking: this.media.mic && level > 0.08,
      mic: this.media.mic,
      cam: this.media.cam,
    });
  }

  pushPresence(force = false) {
    if (!this.session) return;
    const now = performance.now();
    if (!force && now - this.presenceAt < PRESENCE_INTERVAL_MS) return;
    const body = this.meadow.self();
    const patch = {
      mic: this.media.mic,
      cam: this.media.cam,
      screen: this.media.screen,
      x: Math.round((body?.x ?? 0) * 2) / 2,
      y: Math.round((body?.y ?? 0) * 2) / 2,
    };
    const key = JSON.stringify(patch);
    if (key === this.presenceKey) return;
    this.presenceKey = key;
    this.presenceAt = now;
    void this.session.setPresence(patch);
  }

  private syncBodies() {
    const present = new Set<string>();
    const ownKey = this.meadow.self()?.participantId ?? this.session?.participantId ?? "self";
    present.add(ownKey);
    for (const member of this.members) {
      const id = member.self ? ownKey : member.participantId;
      present.add(id);
      const actor = this.meadow.actor(id, {
        name: member.name || this.t.traveler,
        color: member.color,
        kind: member.kind,
        spirit: member.spirit,
        self: member.self,
        x: member.spirit ? 0 : member.x,
        y: member.spirit ? 0 : member.y,
      });
      actor.mic = member.mic;
      actor.cam = member.cam;
    }
    for (const id of [...this.meadow.actors.keys()]) {
      if (present.has(id)) continue;
      this.meadow.forget(id);
      this.poses.delete(id);
    }
  }

  private rekeySelf(participantId: string) {
    const body = this.meadow.actors.get("self");
    if (!body || !participantId) return;
    this.meadow.actors.delete("self");
    body.participantId = participantId;
    this.meadow.actors.set(participantId, body);
    this.syncBodies();
  }

  dispose() {
    this.contextOff?.();
    this.loopOff?.();
    this.media.stop();
    this.session?.dispose();
  }
}

const seedOf = (context: AppRuntimeContext) => context.shell?.space?.id ?? context.app.homeSpace?.id ?? context.app.id;

const spawnPoint = () => {
  const angle = Math.random() * Math.PI * 2;
  const radius = 5 + Math.random() * 2.5;
  return { x: Math.cos(angle) * radius, y: Math.min(MEADOW_RADIUS, Math.sin(angle) * radius) };
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
