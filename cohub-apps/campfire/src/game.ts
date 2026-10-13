import { MAX_ROUNDS, ROUND_MS } from "./protocol";

export type GameEvent = {
  type: string;
  data: unknown;
  at: number;
  sender: string;
};

export type RoundState = {
  round: number;
  drawer: string;
  length: number;
  hint: string;
  startedAt: number;
  deadline: number;
  guesses: Array<{ participantId: string; text: string; at: number }>;
};

export type Reveal = {
  round: number;
  word: string;
  winner: string | null;
  reason: "solved" | "timeout" | "skipped";
  at: number;
};

export type GameState = {
  playing: boolean;
  order: string[];
  total: number;
  startedAt: number;
  round: RoundState | null;
  reveal: Reveal | null;
  lastRound: number;
  scores: Record<string, number>;
};

export const emptyGame = (): GameState => ({
  playing: false,
  order: [],
  total: 0,
  startedAt: 0,
  round: null,
  reveal: null,
  lastRound: 0,
  scores: {},
});

const POINTS = { guesser: 2, drawer: 1 } as const;
const MAX_GUESS_LENGTH = 40;
export const PICK_GRACE_MS = 25_000;
export const REVEAL_PAUSE_MS = 4_500;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const nextRoundNumber = (state: GameState) => state.lastRound + 1;

export const drawerFor = (state: GameState, round: number): string | null =>
  state.order.length === 0 ? null : (state.order[(round - 1) % state.order.length] ?? null);

export const reduceGame = (events: Iterable<GameEvent>, initial: GameState = emptyGame()): GameState => {
  let state = initial;
  for (const event of events) state = applyGameEvent(state, event);
  return state;
};

export const applyGameEvent = (state: GameState, event: GameEvent): GameState => {
  const data = record(event.data);
  if (!data) return state;
  switch (event.type) {
    case "sketch.start": {
      if (state.playing) return state;
      const order = Array.isArray(data.order)
        ? [...new Set(data.order.filter((item): item is string => typeof item === "string" && item.length > 0))]
        : [];
      if (order.length < 2) return state;
      return { ...emptyGame(), playing: true, order, total: Math.min(MAX_ROUNDS, Math.max(order.length, 3)), startedAt: event.at };
    }
    case "sketch.end":
      return state.playing ? { ...state, playing: false, round: null } : state;
    case "sketch.round": {
      if (!state.playing || state.round) return state;
      const round = nextRoundNumber(state);
      if (data.round !== round || event.sender !== drawerFor(state, round)) return state;
      const length = typeof data.length === "number" ? Math.max(1, Math.min(32, Math.round(data.length))) : 1;
      return {
        ...state,
        lastRound: round,
        reveal: null,
        round: {
          round,
          drawer: event.sender,
          length,
          hint: typeof data.hint === "string" ? data.hint.slice(0, 24) : "",
          startedAt: event.at,
          deadline: event.at + ROUND_MS,
          guesses: [],
        },
      };
    }
    case "sketch.guess": {
      const round = state.round;
      if (!round || data.round !== round.round || typeof data.text !== "string") return state;
      if (event.sender === round.drawer || !state.order.includes(event.sender)) return state;
      if (round.guesses.length >= 240) return state;
      const text = data.text.trim().slice(0, MAX_GUESS_LENGTH);
      if (!text) return state;
      return { ...state, round: { ...round, guesses: [...round.guesses, { participantId: event.sender, text, at: event.at }] } };
    }
    case "sketch.reveal": {
      const reason = data.reason === "solved" || data.reason === "timeout" ? data.reason : "skipped";
      const word = typeof data.word === "string" ? data.word.slice(0, 40) : "";
      const round = state.round;
      if (round && data.round === round.round) {
        const winner = typeof data.winner === "string" ? data.winner : null;
        const solved = reason === "solved" && event.sender === round.drawer && winner !== null
          && round.guesses.some((guess) => guess.participantId === winner);
        if (reason === "solved" && !solved) return state;
        const scores = { ...state.scores };
        if (solved && winner) {
          scores[winner] = (scores[winner] ?? 0) + POINTS.guesser;
          scores[round.drawer] = (scores[round.drawer] ?? 0) + POINTS.drawer;
        }
        return {
          ...state,
          round: null,
          scores,
          reveal: { round: round.round, word, winner: solved ? winner : null, reason, at: event.at },
        };
      }
      if (!round && state.playing && reason === "skipped" && data.round === nextRoundNumber(state)) {
        return {
          ...state,
          lastRound: nextRoundNumber(state),
          reveal: { round: nextRoundNumber(state), word: "", winner: null, reason, at: event.at },
        };
      }
      return state;
    }
    default:
      return state;
  }
};

export type Duty =
  | { kind: "pick"; round: number }
  | { kind: "timeout"; round: number }
  | { kind: "skip"; round: number }
  | { kind: "end" };

export const dutyFor = (
  state: GameState,
  input: { me: string; keeper: boolean; present: (participantId: string) => boolean; now: number },
): Duty | null => {
  if (!state.playing) return null;
  const { me, keeper, present, now } = input;
  const round = state.round;

  if (round) {
    if (round.drawer === me && now >= round.deadline) return { kind: "timeout", round: round.round };
    const drawerGone = !present(round.drawer);
    if (keeper && (drawerGone || now >= round.deadline + 5_000)) return { kind: "skip", round: round.round };
    return null;
  }

  const next = nextRoundNumber(state);
  const since = state.reveal?.at ?? state.startedAt;
  if (now - since < (state.reveal ? REVEAL_PAUSE_MS : 600)) return null;
  if (next > state.total) return keeper ? { kind: "end" } : null;
  const drawer = drawerFor(state, next);
  if (keeper && (!drawer || !present(drawer) || now - since > PICK_GRACE_MS)) return { kind: "skip", round: next };
  if (drawer === me) return { kind: "pick", round: next };
  return null;
};

const normalizeGuess = (value: string) =>
  value.toLowerCase().normalize("NFKC").replace(/[\s\p{P}\p{S}]+/gu, "");

export const isCorrectGuess = (guess: string, word: string) => {
  const normalized = normalizeGuess(guess);
  return normalized.length > 0 && normalized === normalizeGuess(word);
};

export const maskWord = (length: number) => "＿".repeat(Math.max(0, length));
