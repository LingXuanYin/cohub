<script lang="ts">
  import { Eraser, SkipForward, X } from "@lucide/svelte";
  import type { Campfire } from "../fire.svelte";
  import { drawerFor, maskWord } from "../game";
  import { INK_COLORS, INK_WIDTHS } from "../ink";
  import Board from "./Board.svelte";

  type Props = { fire: Campfire; onClose: () => void };

  let { fire, onClose }: Props = $props();
  const t = $derived(fire.t);
  const sketch = $derived(fire.sketch);
  const game = $derived(sketch.state);
  const round = $derived(game.round);
  const me = $derived(fire.session?.participantId ?? "");
  const drawer = $derived(round ? (fire.names.get(round.drawer) ?? t.traveler) : "");
  const mine = $derived(round?.drawer === me);
  const left = $derived(round ? Math.max(0, Math.ceil((round.deadline - fire.clock) / 1000)) : 0);
  const players = $derived(sketch.players);
  const scores = $derived(
    Object.entries(game.scores)
      .map(([id, score]) => ({ id, name: fire.names.get(id) ?? t.traveler, score }))
      .sort((a, b) => b.score - a.score),
  );

  let color = $state<string>(INK_COLORS[1]);
  let width = $state<number>(INK_WIDTHS[1]);
  let guess = $state("");

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const line = guess.trim();
    if (!line) return;
    guess = "";
    void sketch.guess(line);
  };
</script>

<section class="panel sketch" aria-label={t.sketch}>
  <header>
    <div class="heading">
      <h2>{t.sketch}</h2>
      {#if round}
        <p>
          {t.sketchRound(round.round, game.total)} · {mine ? t.sketchYours : t.sketchDraws(drawer)}
          <span class="clock" class:low={left <= 10}>{left}s</span>
        </p>
      {:else if game.playing}
        <p>{sketch.offer ? t.sketchPick : t.sketchWaiting(fire.names.get(drawerFor(game, game.lastRound + 1) ?? "") ?? t.traveler)}</p>
      {:else}
        <p>{t.sketchIntro}</p>
      {/if}
    </div>
    <button class="icon-button" type="button" onclick={onClose} aria-label={t.close}><X size={16} /></button>
  </header>

  {#if sketch.offer}
    <div class="offer">
      {#each sketch.offer as entry (entry.word)}
        <button type="button" onclick={() => void sketch.pick(entry)}>
          <strong>{entry.word}</strong>
          <span>{entry.hint}</span>
        </button>
      {/each}
    </div>
  {/if}

  <div class="slate">
    <Board ops={sketch.ink} version={sketch.inkVersion} pen={sketch.drawing ? { color, width } : null} onStroke={(op) => sketch.stroke(op)} />
    {#if round && !mine}
      <p class="mask" aria-label={t.sketchLength(round.length)}>
        <span>{round.hint}</span>
        {maskWord(round.length)}
      </p>
    {:else if mine && sketch.secret}
      <p class="mask secret"><span>{round?.hint}</span>{sketch.secret}</p>
    {/if}
    {#if game.reveal && !round && !sketch.offer}
      {#key game.reveal.at}
        <p class="reveal">
          {#if game.reveal.reason === "solved"}
            {t.sketchSolved(fire.names.get(game.reveal.winner ?? "") ?? t.traveler, game.reveal.word)}
          {:else if game.reveal.reason === "timeout"}
            {t.sketchTimeout(game.reveal.word)}
          {:else}
            {t.sketchSkipped}
          {/if}
        </p>
      {/key}
    {/if}
  </div>

  {#if sketch.drawing}
    <div class="tools">
      <div class="swatches">
        {#each INK_COLORS as swatch (swatch)}
          <button type="button" class:active={color === swatch} style:--swatch={swatch} aria-label={swatch} onclick={() => (color = swatch)}></button>
        {/each}
      </div>
      <div class="widths">
        {#each INK_WIDTHS as size (size)}
          <button type="button" class:active={width === size} aria-label={`${size}`} onclick={() => (width = size)}>
            <i style:--dot="{size + 2}px"></i>
          </button>
        {/each}
      </div>
      <button class="icon-button" type="button" onclick={() => sketch.clearBoard(true)} title={t.sketchClear}><Eraser size={16} /></button>
      <button class="icon-button" type="button" onclick={() => void sketch.skip()} title={t.sketchSkip}><SkipForward size={16} /></button>
    </div>
  {:else if round && sketch.joined}
    <form class="guess" onsubmit={submit}>
      <input bind:value={guess} maxlength="40" placeholder={t.sketchGuess} aria-label={t.sketchGuess} autocomplete="off" />
      <button class="ember-button" type="submit" disabled={!guess.trim()}>{t.send}</button>
    </form>
  {/if}

  {#if round && round.guesses.length > 0}
    <ol class="guesses">
      {#each round.guesses.slice(-5) as item (item.at + item.participantId)}
        <li><b>{fire.names.get(item.participantId) ?? t.traveler}</b> {item.text}</li>
      {/each}
    </ol>
  {/if}

  <footer>
    <div class="players">
      {#each players as player (player.participantId)}
        {@const score = game.scores[player.participantId] ?? 0}
        <span class="player" class:drawing={round?.drawer === player.participantId} style:--ember={player.color}>
          {player.name || t.traveler}{#if score > 0}<b>{score}</b>{/if}
        </span>
      {/each}
      {#if players.length === 0}
        <span class="empty">{t.sketchNobody}</span>
      {/if}
    </div>
    <div class="buttons">
      {#if !sketch.joined}
        <button class="ember-button" type="button" onclick={() => void sketch.join(true)}>{t.sketchJoin}</button>
      {:else if !game.playing}
        <button class="text-button" type="button" onclick={() => void sketch.join(false)}>{t.sketchLeave}</button>
        <button class="ember-button" type="button" disabled={players.length < 2} onclick={() => void sketch.start()}>{t.sketchStart}</button>
      {:else if fire.keeper}
        <button class="text-button" type="button" onclick={() => void sketch.stop()}>{t.sketchStop}</button>
      {/if}
    </div>
  </footer>

  {#if !game.playing && scores.length > 0}
    <p class="final">{t.sketchFinal(scores[0]?.name ?? "", scores[0]?.score ?? 0)}</p>
  {/if}
</section>

<style>
  .sketch {
    position: absolute;
    top: max(64px, calc(env(safe-area-inset-top) + 52px));
    right: 14px;
    width: min(420px, calc(100% - 28px));
    max-height: calc(100% - 210px);
    overflow-y: auto;
    display: grid;
    gap: 12px;
    padding: 16px;
    z-index: 5;
    animation: slide 0.4s var(--ease-out);
  }

  header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 500;
    font-size: 1.25rem;
    color: var(--ember-100);
  }

  .heading p {
    margin: 2px 0 0;
    color: var(--mist-dim);
    font-size: 0.84rem;
  }

  .clock {
    margin-left: 6px;
    font-family: var(--font-mono);
    color: var(--mist);
  }

  .clock.low {
    color: var(--ember-300);
  }

  .offer {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .offer button {
    display: grid;
    gap: 2px;
    padding: 10px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid oklch(50% 0.06 60 / 0.6);
    background: oklch(28% 0.05 55 / 0.45);
    text-align: center;
    transition: background 0.2s var(--ease-out), transform 0.2s var(--ease-out);
  }

  .offer button:hover {
    background: oklch(36% 0.08 55 / 0.6);
    transform: translateY(-1px);
  }

  .offer strong {
    font-weight: 600;
    color: var(--ember-100);
  }

  .offer span {
    font-size: 0.72rem;
    color: var(--mist-dim);
  }

  .slate {
    position: relative;
  }

  .mask {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0;
    padding: 4px 12px;
    border-radius: 999px;
    background: oklch(18% 0.03 258 / 0.85);
    font-family: var(--font-mono);
    letter-spacing: 0.12em;
    white-space: nowrap;
    pointer-events: none;
  }

  .mask span {
    font-family: var(--font-sans);
    letter-spacing: 0;
    font-size: 0.72rem;
    color: var(--mist-dim);
  }

  .mask.secret {
    font-family: var(--font-display);
    letter-spacing: 0.02em;
    color: var(--ember-100);
  }

  .reveal {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 20px;
    border-radius: var(--radius-md);
    background: oklch(16% 0.03 258 / 0.78);
    font-family: var(--font-display);
    font-size: 1.15rem;
    text-align: center;
    color: var(--ember-100);
    animation: fade 0.4s var(--ease-out);
  }

  .tools {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .swatches,
  .widths {
    display: flex;
    gap: 6px;
  }

  .swatches button {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--swatch);
    transition: transform 0.15s var(--ease-out);
  }

  .swatches button.active {
    box-shadow: 0 0 0 2px var(--night-800), 0 0 0 4px var(--swatch);
  }

  .widths button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
  }

  .widths button.active {
    background: oklch(32% 0.03 258);
  }

  .widths i {
    width: var(--dot);
    height: var(--dot);
    border-radius: 50%;
    background: var(--mist);
  }

  .guess {
    display: flex;
    gap: 8px;
  }

  .guess input {
    flex: 1;
    min-width: 0;
    padding: 0.55em 0.85em;
    border-radius: var(--radius-sm);
    border: 1px solid oklch(46% 0.03 258 / 0.55);
    background: oklch(16% 0.025 258 / 0.8);
  }

  .guess input:focus {
    outline: none;
    border-color: var(--ember-500);
  }

  .guesses {
    display: grid;
    gap: 3px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.84rem;
    color: var(--mist-dim);
  }

  .guesses b {
    font-weight: 500;
    color: var(--mist);
  }

  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .players {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .player {
    display: inline-flex;
    gap: 5px;
    align-items: baseline;
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 0.78rem;
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--ember), transparent 50%);
  }

  .player.drawing {
    background: color-mix(in oklch, var(--ember), transparent 75%);
  }

  .player b {
    font-family: var(--font-mono);
    font-weight: 400;
    color: var(--ember-300);
  }

  .empty,
  .final {
    margin: 0;
    font-size: 0.82rem;
    color: var(--mist-dim);
  }

  .buttons {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  @keyframes slide {
    from {
      opacity: 0;
      translate: 12px 0;
    }
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }

  @media (max-width: 640px) {
    .sketch {
      top: auto;
      right: 10px;
      left: 10px;
      bottom: calc(max(14px, env(safe-area-inset-bottom)) + 108px);
      width: auto;
      max-height: 62%;
    }
  }
</style>
