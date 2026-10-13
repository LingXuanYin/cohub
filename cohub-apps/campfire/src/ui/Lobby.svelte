<script lang="ts">
  import { untrack } from "svelte";
  import type { Campfire } from "../fire.svelte";
  import { DEFAULT_COLORS } from "../net";

  type Props = { fire: Campfire };

  let { fire }: Props = $props();
  const t = $derived(fire.t);

  const initial = untrack(() => ({ profile: fire.profile, code: fire.code }));
  const randomColor = DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)] ?? DEFAULT_COLORS[0];
  let name = $state(initial.profile?.name ?? "");
  let color = $state<string>(initial.profile?.color ?? randomColor);
  let code = $state(initial.code);
  let listen = $state(false);
  const busy = $derived(fire.phase === "joining");

  $effect(() => {
    code = fire.code;
  });

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    void fire.sit({ name: name.trim() || t.traveler, color, code, listen });
  };
</script>

<div class="lobby">
  <form class="card" onsubmit={submit}>
    <header>
      <h1>{t.title}</h1>
      <p>{t.tagline}</p>
    </header>

    <label class="field">
      <span>{t.nameLabel}</span>
      <input bind:value={name} placeholder={t.traveler} maxlength="24" autocomplete="nickname" />
    </label>

    <fieldset class="field">
      <legend>{t.colorLabel}</legend>
      <div class="swatches">
        {#each DEFAULT_COLORS as swatch, i (swatch)}
          <label class="swatch" style:--swatch={swatch}>
            <input type="radio" name="color" value={swatch} bind:group={color} aria-label={t.colour(i + 1)} />
            <span></span>
          </label>
        {/each}
      </div>
    </fieldset>

    <div class="field">
      <label for="campfire-code">{t.codeLabel}</label>
      <div class="code">
        <input id="campfire-code" bind:value={code} maxlength="32" spellcheck="false" autocapitalize="characters" autocomplete="off" />
        <button type="button" class="text-button" onclick={() => fire.newCode()}>{t.newFire}</button>
      </div>
      <small>{fire.linked ? t.codeLinked : t.codeHint}</small>
    </div>

    {#if fire.joinError}
      <p class="error" role="alert">{fire.joinError}</p>
    {/if}

    <footer>
      <button class="ember-button" type="submit" disabled={busy}>{busy ? t.joining : t.sit}</button>
      <label class="listen">
        <input type="checkbox" bind:checked={listen} />
        {t.listenOnly}
      </label>
    </footer>
  </form>
</div>

<style>
  .lobby {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: end start;
    padding: clamp(16px, 5vw, 56px);
    z-index: 5;
    background: linear-gradient(90deg, oklch(14% 0.03 258 / 0.78), oklch(14% 0.03 258 / 0) 60%);
  }

  .card {
    width: min(400px, 100%);
    display: grid;
    gap: 20px;
    animation: enter 0.8s var(--ease-out) both 0.15s;
  }

  header {
    display: grid;
    gap: 8px;
  }

  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: clamp(2.6rem, 7vw, 3.6rem);
    letter-spacing: -0.02em;
    line-height: 0.95;
    color: var(--ember-100);
  }

  header p {
    margin: 0;
    color: var(--mist-dim);
    max-width: 34ch;
    text-wrap: pretty;
  }

  .field {
    display: grid;
    gap: 7px;
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  .field > span,
  .field > label,
  legend {
    padding: 0;
    font-size: 0.74rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mist-dim);
  }

  input:not([type]),
  .code input {
    width: 100%;
    padding: 0.62em 0.85em;
    border-radius: var(--radius-sm);
    border: 1px solid oklch(46% 0.03 258 / 0.55);
    background: oklch(16% 0.025 258 / 0.8);
    transition: border-color 0.2s var(--ease-out);
  }

  input:focus {
    outline: none;
    border-color: var(--ember-500);
  }

  .code {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .code input {
    font-family: var(--font-mono);
    letter-spacing: 0.06em;
  }

  small {
    color: var(--mist-dim);
    font-size: 0.78rem;
  }

  .swatches {
    display: flex;
    gap: 10px;
  }

  .swatch {
    position: relative;
    width: 32px;
    height: 32px;
    cursor: pointer;
  }

  .swatch input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
    cursor: pointer;
  }

  .swatch span {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--swatch);
    transition: transform 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
  }

  .swatch:hover span {
    transform: translateY(-2px);
  }

  .swatch input:checked + span {
    box-shadow: 0 0 0 3px var(--night-900), 0 0 0 5px var(--swatch);
  }

  .swatch input:focus-visible + span {
    outline: 2px solid var(--ember-500);
    outline-offset: 6px;
  }

  footer {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .listen {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--mist-dim);
    font-size: 0.86rem;
    cursor: pointer;
  }

  .listen input {
    accent-color: var(--ember-500);
  }

  .error {
    margin: 0;
    color: var(--ember-300);
    font-size: 0.86rem;
  }

  @keyframes enter {
    from {
      opacity: 0;
      translate: 0 12px;
    }
  }

  @media (max-width: 640px) {
    .lobby {
      place-items: end stretch;
      background: linear-gradient(0deg, oklch(14% 0.03 258 / 0.92) 45%, oklch(14% 0.03 258 / 0));
    }
  }
</style>
