<script lang="ts">
  import { Link, LogOut, Terminal } from "@lucide/svelte";
  import type { Campfire } from "../fire.svelte";

  type Props = { fire: Campfire };

  let { fire }: Props = $props();
  const t = $derived(fire.t);
  const connection = $derived(fire.connection);
  const status = $derived(
    connection.transport === "peer"
      ? [connection.path === "relay" ? t.relayed : t.direct, connection.rttMs === null ? null : t.latency(connection.rttMs)].filter(Boolean).join(" · ")
      : connection.transport === "relay"
        ? t.voicesOff
        : t.connecting,
  );
</script>

<header class="top">
  <div class="place">
    <span class="mark" aria-hidden="true"></span>
    <span class="title">{t.title}</span>
    <button class="code" type="button" onclick={() => void fire.copyLink()} title={t.copyLink}>
      {fire.code}
      <Link size={13} aria-hidden="true" />
    </button>
    <span class="people">{t.people(fire.people.length)}</span>
  </div>

  <div class="actions">
    <span class="link" class:down={connection.transport === "relay"} class:pending={connection.transport === "connecting"} title={t.connectionHint}>
      <i aria-hidden="true"></i>
      {status}
    </span>
    <button class="icon-button" type="button" onclick={() => void fire.copyInvite()} title={t.inviteHint} aria-label={t.invite}>
      <Terminal size={16} />
    </button>
    <button class="icon-button" type="button" onclick={() => void fire.leave()} title={t.leave} aria-label={t.leave}>
      <LogOut size={16} />
    </button>
  </div>
</header>

{#if fire.notice}
  {#key fire.notice}
    <p class="notice" role="status">{fire.notice}</p>
  {/key}
{/if}

<style>
  .top {
    position: absolute;
    inset: 0 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: max(12px, env(safe-area-inset-top)) 14px 12px;
    z-index: 4;
    pointer-events: none;
    background: linear-gradient(oklch(14% 0.03 258 / 0.7), transparent);
  }

  .place,
  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    pointer-events: auto;
  }

  .mark {
    width: 10px;
    height: 12px;
    border-radius: 50% 50% 45% 45% / 60% 60% 40% 40%;
    background: radial-gradient(circle at 50% 75%, var(--ember-300), var(--ember-600));
    box-shadow: 0 0 12px 2px oklch(72% 0.15 60 / 0.5);
  }

  .title {
    font-family: var(--font-display);
    font-size: 1.1rem;
    color: var(--ember-100);
  }

  .code {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 9px;
    border-radius: 999px;
    font-family: var(--font-mono);
    font-size: 0.74rem;
    letter-spacing: 0.06em;
    color: var(--mist);
    background: oklch(24% 0.03 258 / 0.7);
    transition: background 0.2s var(--ease-out);
  }

  .code:hover {
    background: oklch(30% 0.04 258 / 0.85);
  }

  .people {
    color: var(--mist-dim);
    font-size: 0.82rem;
    white-space: nowrap;
  }

  .link {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.78rem;
    color: var(--mist-dim);
    white-space: nowrap;
  }

  .link i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: oklch(78% 0.15 150);
    box-shadow: 0 0 8px oklch(78% 0.15 150 / 0.6);
  }

  .link.pending i {
    background: var(--ember-300);
    box-shadow: none;
    animation: pulse 1.2s infinite;
  }

  .link.down i {
    background: oklch(66% 0.17 28);
    box-shadow: none;
  }

  .notice {
    position: absolute;
    top: max(58px, calc(env(safe-area-inset-top) + 46px));
    left: 50%;
    transform: translateX(-50%);
    max-width: min(520px, calc(100% - 32px));
    margin: 0;
    padding: 8px 14px;
    border-radius: 999px;
    background: oklch(92% 0.03 80);
    color: oklch(22% 0.03 258);
    font-size: 0.84rem;
    text-align: center;
    z-index: 6;
    animation: drop 0.35s var(--ease-out);
  }

  @keyframes drop {
    from {
      opacity: 0;
      translate: 0 -6px;
    }
  }

  @keyframes pulse {
    50% {
      opacity: 0.4;
    }
  }

  @media (max-width: 640px) {
    .title,
    .link {
      display: none;
    }
  }
</style>
