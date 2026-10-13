<script lang="ts">
  import { X } from "@lucide/svelte";
  import type { Campfire } from "../fire.svelte";

  type Props = { fire: Campfire; onClose: () => void };

  let { fire, onClose }: Props = $props();
  const t = $derived(fire.t);
  let list = $state<HTMLOListElement | null>(null);

  const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  $effect(() => {
    void fire.log.length;
    list?.lastElementChild?.scrollIntoView({ block: "end" });
  });
</script>

<section class="panel log" aria-label={t.log}>
  <header>
    <h2>{t.log}</h2>
    <button class="icon-button" type="button" onclick={onClose} aria-label={t.close}><X size={16} /></button>
  </header>

  {#if fire.log.length === 0}
    <p class="empty">{t.logEmpty}</p>
  {:else}
    <ol bind:this={list}>
      {#each fire.log as line (line.id)}
        <li class={line.kind}>
          <time datetime={new Date(line.at).toISOString()}>{time.format(line.at)}</time>
          {#if line.kind === "ember"}
            <p>{t.logEmber(line.name || t.traveler)}</p>
          {:else if line.kind === "game"}
            <p>{line.text}</p>
          {:else}
            <p><b>{line.name || t.traveler}</b>{line.text}</p>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}

  <p class="foot">{t.logFoot}</p>
</section>

<style>
  .log {
    position: absolute;
    top: max(64px, calc(env(safe-area-inset-top) + 52px));
    left: 14px;
    width: min(360px, calc(100% - 28px));
    max-height: calc(100% - 220px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 10px;
    padding: 16px;
    z-index: 5;
    animation: slide 0.4s var(--ease-out);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 500;
    font-size: 1.2rem;
    color: var(--ember-100);
  }

  ol {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  li {
    display: grid;
    grid-template-columns: 3.2em minmax(0, 1fr);
    gap: 8px;
    font-size: 0.86rem;
  }

  time {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--mist-dim);
    padding-top: 2px;
  }

  li p {
    margin: 0;
    color: var(--mist);
    text-wrap: pretty;
  }

  li b {
    font-weight: 500;
    color: var(--mist-dim);
    margin-right: 6px;
  }

  .spirit p {
    font-family: var(--font-display);
    font-size: 0.95rem;
    line-height: 1.5;
    color: var(--ember-100);
  }

  .spirit b {
    color: var(--ember-300);
  }

  .ember p,
  .game p {
    color: var(--mist-dim);
    font-style: italic;
  }

  .empty,
  .foot {
    margin: 0;
    font-size: 0.8rem;
    color: var(--mist-dim);
  }

  .foot {
    border-top: 1px solid oklch(40% 0.03 258 / 0.4);
    padding-top: 8px;
  }

  @keyframes slide {
    from {
      opacity: 0;
      translate: -12px 0;
    }
  }

  @media (max-width: 640px) {
    .log {
      top: auto;
      left: 10px;
      right: 10px;
      bottom: calc(max(14px, env(safe-area-inset-bottom)) + 108px);
      width: auto;
      max-height: 55%;
    }
  }
</style>
