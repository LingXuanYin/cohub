import { buildTerrain, clamp, confine, fireScale, fireWarmth, hearthRadius, Motes, type Terrain } from "./world";
import { lerpAngle } from "./pose";

export type Actor = {
  participantId: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  angle: number;
  name: string;
  color: string;
  kind: "user" | "agent" | "cli";
  spirit: boolean;
  self: boolean;
  level: number;
  reportedLevel: number;
  talking: boolean;
  moving: boolean;
  mic: boolean;
  cam: boolean;
  live: boolean;
};

export type Bubble = {
  id: string;
  participantId: string;
  text: string;
  at: number;
  spirit: boolean;
  ttl: number;
};

export type Emote = { id: string; participantId: string; emoji: string; at: number };

export type ActorSeed = {
  name: string;
  color: string;
  kind: Actor["kind"];
  spirit: boolean;
  self: boolean;
  x: number;
  y: number;
};

const WALK_SPEED = 3.3;
const KEY_SPEED = 4.4;
const BUBBLE_TTL = 9000;
const SPIRIT_TTL = 22_000;
const EMOTE_TTL = 2400;

export class Meadow {
  readonly terrain: Terrain = buildTerrain();
  readonly motes = new Motes();
  readonly actors = new Map<string, Actor>();
  bubbles: Bubble[] = [];
  emotes: Emote[] = [];
  emberTimes: number[] = [];
  camera = { x: 0, y: 0 };
  zoom = 1;
  keys = new Set<string>();
  reducedMotion = false;
  spiritVoice = 0;
  view = { width: 0, height: 0, scale: 20 };
  steered = false;
  private visible = true;
  private bubbleSeq = 0;
  private emoteSeq = 0;

  setVisible(visible: boolean) {
    this.visible = visible;
  }

  get visibleNow() {
    return this.visible;
  }

  actor(id: string, seed: ActorSeed): Actor {
    const existing = this.actors.get(id);
    if (existing) {
      existing.name = seed.name;
      existing.color = seed.color;
      existing.kind = seed.kind;
      existing.spirit = seed.spirit;
      existing.self = seed.self;
      if (!existing.live && !existing.self) {
        existing.targetX = seed.x;
        existing.targetY = seed.y;
      }
      return existing;
    }
    const actor: Actor = {
      participantId: id,
      ...seed,
      targetX: seed.x,
      targetY: seed.y,
      angle: 0,
      level: 0,
      reportedLevel: 0,
      talking: false,
      moving: false,
      mic: false,
      cam: false,
      live: false,
    };
    this.actors.set(id, actor);
    return actor;
  }

  forget(id: string) {
    this.actors.delete(id);
  }

  self() {
    for (const actor of this.actors.values()) if (actor.self) return actor;
    return null;
  }

  addEmber(at: number) {
    this.emberTimes.push(at);
    if (this.emberTimes.length > 240) this.emberTimes.splice(0, this.emberTimes.length - 240);
  }

  get warmth() {
    return fireWarmth(this.emberTimes, Date.now());
  }

  get fireScale() {
    return fireScale(this.warmth);
  }

  get hearth() {
    return hearthRadius(this.warmth);
  }

  say(participantId: string, text: string, options: { spirit?: boolean } = {}) {
    this.bubbleSeq += 1;
    this.bubbles.push({
      id: `b${this.bubbleSeq}`,
      participantId,
      text: text.slice(0, 220),
      at: performance.now(),
      spirit: options.spirit === true,
      ttl: options.spirit ? SPIRIT_TTL : BUBBLE_TTL,
    });
    if (this.bubbles.length > 8) this.bubbles.shift();
  }

  holdSpirit(participantId: string, ms: number) {
    const bubble = this.bubbles.findLast((item) => item.spirit && item.participantId === participantId);
    if (bubble) bubble.ttl = Math.max(bubble.ttl, performance.now() - bubble.at + ms);
  }

  emote(participantId: string, emoji: string) {
    this.emoteSeq += 1;
    this.emotes.push({ id: `e${this.emoteSeq}`, participantId, emoji, at: performance.now() });
    if (this.emotes.length > 30) this.emotes.shift();
  }

  frame(x: number, y: number) {
    this.camera.x = x;
    this.camera.y = y - 3.4;
  }

  walkTo(x: number, y: number) {
    const me = this.self();
    if (!me) return;
    this.steered = true;
    const spot = confine(x, y);
    me.targetX = spot.x;
    me.targetY = spot.y;
  }

  step(dt: number, now: number) {
    const me = this.self();
    if (me) {
      let dx = 0;
      let dy = 0;
      if (this.keys.size > 0) this.steered = true;
      for (const key of this.keys) {
        if (key === "a" || key === "arrowleft") dx -= 1;
        else if (key === "d" || key === "arrowright") dx += 1;
        else if (key === "w" || key === "arrowup") dy -= 1;
        else if (key === "s" || key === "arrowdown") dy += 1;
      }
      if (dx !== 0 || dy !== 0) {
        const length = Math.hypot(dx, dy) || 1;
        me.targetX = me.x + (dx / length) * 5;
        me.targetY = me.y + (dy / length) * 5;
      }
      const toX = me.targetX - me.x;
      const toY = me.targetY - me.y;
      const distance = Math.hypot(toX, toY);
      if (distance > 0.03) {
        const step = Math.min(distance, (this.keys.size > 0 ? KEY_SPEED : WALK_SPEED) * dt);
        const spot = confine(me.x + (toX / distance) * step, me.y + (toY / distance) * step);
        const travelled = Math.hypot(spot.x - me.x, spot.y - me.y);
        me.x = spot.x;
        me.y = spot.y;
        me.angle = lerpAngle(me.angle, Math.atan2(toY, toX), Math.min(1, dt * 10));
        me.moving = travelled > 0.001;
      } else {
        me.moving = false;
      }
      this.camera.x += (me.x - this.camera.x) * Math.min(1, dt * 3.1);
      this.camera.y += (me.y - 3.4 - this.camera.y) * Math.min(1, dt * 2.4);
    }

    for (const actor of this.actors.values()) {
      const target = actor.talking ? Math.max(0.35, actor.reportedLevel) : 0;
      actor.level += (target - actor.level) * Math.min(1, dt * 9);
    }

    this.bubbles = this.bubbles.filter((bubble) => now - bubble.at < bubble.ttl);
    this.emotes = this.emotes.filter((emote) => now - emote.at < EMOTE_TTL);

    if (this.visible) {
      this.motes.spawn(this.reducedMotion ? 1 : 2, this.warmth);
      this.motes.step(dt);
    }
  }

  measure(width: number, height: number) {
    this.view = { width, height, scale: this.scaleFor(width, height) };
    return this.view.scale;
  }

  scaleFor(width: number, height: number) {
    return clamp(Math.hypot(width, height) / 42, 18, 44) * this.zoom;
  }

  projectX(x: number) {
    return this.view.width / 2 + (x - this.camera.x) * this.view.scale;
  }

  projectY(y: number) {
    return this.view.height / 2 + (y - this.camera.y) * this.view.scale;
  }
}
