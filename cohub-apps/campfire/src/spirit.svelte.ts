import type { Campfire } from "./fire.svelte";
import type { RoomLogEvent } from "./net";
import { LIVE_WINDOW_MS, roomEvents, SUMMON_WINDOW_MS, type GoneData, type SpeakData, type VoiceData } from "./protocol";

export type SpiritLine = { id: string; text: string; at: number; story: boolean };

const WATCH_INTERVAL_MS = 2500;

export class Spirit {
  summoning = $state(false);
  speaking = $state(false);
  lines = $state.raw<SpiritLine[]>([]);

  private readonly fire: Campfire;
  private claim: { sequence: number; at: number } | null = null;

  constructor(fire: Campfire) {
    this.fire = fire;
  }

  get member() {
    return this.fire.members.find((member) => member.spirit) ?? null;
  }

  get present() {
    return this.member !== null;
  }

  async summon() {
    if (!this.fire.session || this.present || this.summoning) return;
    this.summoning = true;
    try {
      await this.fire.session.publish(roomEvents.summon, { name: this.fire.me?.name ?? "" });
    } catch {
      this.summoning = false;
      this.fire.say(this.fire.t.sendFailed);
    }
  }

  async dismiss() {
    await this.fire.session?.publish(roomEvents.dismiss, {});
  }

  handle(event: RoomLogEvent) {
    const live = Date.now() - event.at < LIVE_WINDOW_MS;
    switch (event.type) {
      case roomEvents.summon:
        return this.onSummon(event, live);
      case roomEvents.speak:
        return this.onSpeak(event, live);
      case roomEvents.voice: {
        const voice = event.data as Partial<VoiceData>;
        if (live && this.owns(event) && typeof voice?.audio === "string" && /^https:\/\//.test(voice.audio)) {
          void this.voice(voice.audio, event.participantId);
        }
        return;
      }
      case roomEvents.gone: {
        if (!this.owns(event)) return;
        this.claim = null;
        this.summoning = false;
        this.speaking = false;
        const reason = (event.data as Partial<GoneData>)?.reason;
        if (live) this.fire.say(reason === "failed" ? this.fire.t.spiritFailed : this.fire.t.spiritGone);
        return;
      }
      default:
        return;
    }
  }

  private owns(event: RoomLogEvent) {
    return this.fire.members.some((member) => member.participantId === event.participantId && member.spirit);
  }

  private onSummon(event: RoomLogEvent, live: boolean) {
    if (this.present) return;
    if (this.claim && event.at - this.claim.at < SUMMON_WINDOW_MS) return;
    this.claim = { sequence: event.sequence, at: event.at };
    if (!live) return;
    this.summoning = true;
    if (event.self) void this.wake();
  }

  private async wake() {
    const session = this.fire.session;
    if (!session) return;
    try {
      const { invite } = await session.invite(600);
      const { taskRunId } = await this.fire.client.app.actions.run({
        action: "spirit",
        input: { invite, locale: this.fire.locale, by: this.fire.me?.name ?? "" },
      });
      await this.watch(taskRunId);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private async watch(taskRunId: string) {
    const deadline = Date.now() + SUMMON_WINDOW_MS;
    while (Date.now() < deadline && this.summoning && !this.present) {
      await new Promise((resolve) => setTimeout(resolve, WATCH_INTERVAL_MS));
      const detail = await this.fire.client.tasks.get(taskRunId).catch(() => null);
      if (detail?.run.status === "failed") return this.fail(detail.run.errorMessage ?? "");
      if (detail?.run.status === "completed" && !this.present) return this.fail("");
    }
  }

  private fail(reason: string) {
    this.summoning = false;
    this.claim = null;
    const t = this.fire.t;
    const detail = reason.trim().split("\n").at(-1)?.slice(0, 160) ?? "";
    if (detail.includes("SPIRIT_BUSY")) return this.fire.say(t.spiritBusy);
    if (detail.includes("SPIRIT_ALREADY_AWAKE")) return this.fire.say(t.spiritAlreadyAwake);
    this.fire.say(detail ? `${t.spiritFailed} · ${detail}` : t.spiritFailed);
  }

  private onSpeak(event: RoomLogEvent, live: boolean) {
    const line = event.data as Partial<SpeakData>;
    if (typeof line?.text !== "string" || !line.text.trim()) return;
    if (live && !this.owns(event)) return;
    this.summoning = false;
    const entry: SpiritLine = { id: String(line.id ?? event.sequence), text: line.text, at: event.at, story: line.story === true };
    this.lines = [...this.lines, entry].slice(-40);
    const name = typeof line.name === "string" && line.name ? line.name.slice(0, 24) : (this.member?.name ?? this.fire.t.spiritName);
    this.fire.append({ id: `${event.sequence}`, kind: "spirit", name, text: line.text, at: event.at });
    if (live) this.fire.meadow.say(event.participantId, line.text, { spirit: true });
  }

  private async voice(url: string, participantId: string) {
    this.speaking = true;
    this.fire.meadow.spiritVoice = 1;
    const duration = await this.fire.media.playSpirit(url).catch(() => 0);
    this.fire.meadow.holdSpirit(participantId, duration + 1500);
    setTimeout(() => {
      this.speaking = false;
      this.fire.meadow.spiritVoice = 0;
    }, Math.max(1500, duration));
  }

  tick() {
    if (this.present) {
      this.summoning = false;
      return;
    }
    if (this.claim && Date.now() - this.claim.at > SUMMON_WINDOW_MS) {
      this.claim = null;
      this.summoning = false;
    }
  }

  reset() {
    this.claim = null;
    this.summoning = false;
    this.speaking = false;
    this.lines = [];
  }
}
