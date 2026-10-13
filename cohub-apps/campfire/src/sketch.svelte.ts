import type { Campfire } from "./fire.svelte";
import { applyGameEvent, dutyFor, emptyGame, isCorrectGuess, type GameState } from "./game";
import { visibleInk, type InkOp } from "./ink";
import type { RoomLogEvent } from "./net";
import { LIVE_WINDOW_MS, roomEvents } from "./protocol";
import { offerWords, type WordEntry } from "./words";

const INK_FLUSH_MS = 60;
const INK_LIMIT = 24_000;
const SYNC_RETRY_MS = 4000;

export class Sketch {
  open = $state(false);
  state = $state.raw<GameState>(emptyGame());
  offer = $state.raw<WordEntry[] | null>(null);
  secret = $state<string | null>(null);
  inkVersion = $state(0);
  ink: InkOp[] = [];

  private readonly fire: Campfire;
  private readonly used: string[] = [];
  private readonly acted = new Set<string>();
  private outgoing: InkOp[] = [];
  private pen: { x: number; y: number; width: number; color: string } | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private syncedAt = new Map<number, number>();

  constructor(fire: Campfire) {
    this.fire = fire;
  }

  get me() {
    return this.fire.session?.participantId ?? "";
  }

  get joined() {
    return this.fire.me?.playing === true;
  }

  get players() {
    return this.fire.members.filter((member) => member.playing && member.kind === "user");
  }

  get drawing() {
    return this.state.round?.drawer === this.me && this.secret !== null;
  }

  handle(event: RoomLogEvent) {
    if (event.type === roomEvents.sketchSync) return this.answerSync(event);
    const before = this.state;
    const after = applyGameEvent(before, { type: event.type, data: event.data, at: event.at, sender: event.participantId });
    if (after === before) return;
    this.state = after;

    const roundChanged = (after.round?.round ?? 0) !== (before.round?.round ?? 0);
    if (roundChanged && after.round) {
      if (after.round.drawer !== this.me) this.clearBoard(false);
      this.offer = null;
    }
    if (after.reveal && after.reveal !== before.reveal) {
      if (after.reveal.word) this.used.push(after.reveal.word);
      this.secret = null;
      this.offer = null;
      this.announce(after);
    }
    if (event.type === roomEvents.sketchStart) {
      this.used.length = 0;
      this.acted.clear();
      this.secret = null;
      this.clearBoard(false);
      if (after.order.includes(this.me) && Date.now() - event.at < LIVE_WINDOW_MS) this.open = true;
    }
    if (event.type === roomEvents.sketchGuess) void this.judge();
  }

  private async judge() {
    const round = this.state.round;
    const secret = this.secret;
    if (!round || !secret || round.drawer !== this.me) return;
    const winner = round.guesses.find((guess) => isCorrectGuess(guess.text, secret));
    if (!winner) return;
    await this.once(`solve:${round.round}`, () =>
      this.fire.session?.publish(roomEvents.sketchReveal, { round: round.round, word: secret, winner: winner.participantId, reason: "solved" }),
    );
  }

  private announce(state: GameState) {
    const reveal = state.reveal;
    if (!reveal) return;
    const t = this.fire.t;
    const winner = reveal.winner ? (this.fire.names.get(reveal.winner) ?? t.traveler) : null;
    const text =
      reveal.reason === "solved" ? t.sketchSolved(winner ?? t.traveler, reveal.word)
      : reveal.reason === "timeout" ? t.sketchTimeout(reveal.word)
      : t.sketchSkipped;
    this.fire.append({ id: `reveal-${reveal.round}-${reveal.at}`, kind: "game", name: "", text, at: reveal.at });
  }

  tick() {
    const session = this.fire.session;
    if (!session || !this.state.playing) return;
    const round = this.state.round;
    if (round && round.drawer !== this.me && this.visibleOps().length <= 1) this.requestSync(round.round);
    const duty = dutyFor(this.state, {
      me: this.me,
      keeper: this.fire.keeper,
      present: (id) => this.fire.members.some((member) => member.participantId === id),
      now: Date.now(),
    });
    if (!duty) return;
    switch (duty.kind) {
      case "pick":
        if (!this.offer) this.offer = offerWords(this.fire.locale, this.used);
        this.open = true;
        return;
      case "timeout":
        void this.once(`timeout:${duty.round}`, () =>
          session.publish(roomEvents.sketchReveal, { round: duty.round, word: this.secret ?? "", winner: null, reason: "timeout" }),
        );
        return;
      case "skip":
        void this.once(`skip:${duty.round}`, () =>
          session.publish(roomEvents.sketchReveal, { round: duty.round, word: "", winner: null, reason: "skipped" }),
        );
        return;
      case "end":
        void this.once(`end:${this.state.startedAt}`, () => session.publish(roomEvents.sketchEnd, {}));
        return;
    }
  }

  private async once(key: string, run: () => Promise<unknown> | undefined) {
    if (this.acted.has(key)) return;
    this.acted.add(key);
    try {
      await run();
    } catch {
      this.acted.delete(key);
    }
  }

  async join(playing = true) {
    await this.fire.session?.setPresence({ playing });
  }

  async start() {
    const order = this.players.map((member) => member.participantId);
    if (order.length < 2) return this.fire.say(this.fire.t.sketchNeedTwo);
    await this.fire.session?.publish(roomEvents.sketchStart, { order });
  }

  async stop() {
    await this.fire.session?.publish(roomEvents.sketchEnd, {});
  }

  async pick(entry: WordEntry) {
    const round = this.state.lastRound + 1;
    this.secret = entry.word;
    this.offer = null;
    this.clearBoard(true);
    await this.fire.session?.publish(roomEvents.sketchRound, { round, length: [...entry.word].length, hint: entry.hint });
  }

  async guess(text: string) {
    const round = this.state.round;
    const line = text.trim();
    if (!round || !line || round.drawer === this.me) return;
    await this.fire.session?.publish(roomEvents.sketchGuess, { round: round.round, text: line.slice(0, 40) });
  }

  async skip() {
    const round = this.state.round;
    if (!round || round.drawer !== this.me) return;
    await this.fire.session?.publish(roomEvents.sketchReveal, { round: round.round, word: this.secret ?? "", winner: null, reason: "skipped" });
  }

  stroke(op: InkOp) {
    if (!this.drawing) return;
    this.push([op]);
    this.outgoing.push(op);
    this.flushTimer ??= setTimeout(() => this.flush(), INK_FLUSH_MS);
  }

  clearBoard(broadcast: boolean) {
    this.ink = [{ kind: "clear" }];
    this.inkVersion += 1;
    this.outgoing = [];
    this.pen = null;
    if (broadcast) this.fire.session?.sendInk([{ kind: "clear" }]);
  }

  receiveInk(from: string, ops: InkOp[]) {
    if (ops.length === 0 || from !== this.state.round?.drawer || from === this.me) return;
    if (ops[0]?.kind === "clear") this.ink = ops;
    else this.push(ops);
    this.inkVersion += 1;
  }

  visibleOps() {
    return visibleInk(this.ink);
  }

  private push(ops: InkOp[]) {
    this.ink.push(...ops);
    if (this.ink.length > INK_LIMIT) this.ink = visibleInk(this.ink).slice(-INK_LIMIT);
    this.inkVersion += 1;
  }

  private flush() {
    this.flushTimer = null;
    const batch = this.outgoing;
    this.outgoing = [];
    if (batch.length === 0) return;
    if (batch[0]?.kind === "move" && this.pen) batch.unshift({ kind: "begin", ...this.pen });
    for (const op of batch) {
      if (op.kind === "begin") this.pen = { x: op.x, y: op.y, width: op.width, color: op.color };
      else if (op.kind === "move" && this.pen) this.pen = { ...this.pen, x: op.x, y: op.y };
      else this.pen = null;
    }
    this.fire.session?.sendInk(batch);
  }

  private requestSync(round: number) {
    const last = this.syncedAt.get(round) ?? 0;
    if (Date.now() - last < SYNC_RETRY_MS) return;
    this.syncedAt.set(round, Date.now());
    this.fire.session?.signal(roomEvents.sketchSync, { round });
  }

  private answerSync(event: RoomLogEvent) {
    const round = this.state.round;
    if (event.self || !round || round.drawer !== this.me) return;
    if ((event.data as { round?: unknown })?.round !== round.round) return;
    this.fire.session?.sendInk(this.visibleOps());
  }

  reset() {
    this.state = emptyGame();
    this.offer = null;
    this.secret = null;
    this.ink = [];
    this.inkVersion += 1;
    this.outgoing = [];
    this.acted.clear();
    this.syncedAt.clear();
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }
}
