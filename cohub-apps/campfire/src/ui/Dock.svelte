<script lang="ts">
  import {
    Flame,
    FlameKindling,
    Mic,
    MicOff,
    PencilLine,
    ScreenShare,
    ScreenShareOff,
    ScrollText,
    Send,
    Sparkles,
    Video,
    VideoOff,
  } from "@lucide/svelte";
  import type { Campfire } from "../fire.svelte";
  import { EMOTES } from "../protocol";

  type Props = { fire: Campfire; panel: "sketch" | "log" | null; onPanel: (panel: "sketch" | "log") => void };

  let { fire, panel, onPanel }: Props = $props();
  const t = $derived(fire.t);
  const media = $derived(fire.media);
  const spirit = $derived(fire.spirit);
  const cooling = $derived(Math.max(0, Math.ceil((fire.emberReadyAt - fire.clock) / 1000)));
  const canShare = typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";

  let text = $state("");
  let toSpirit = $state(false);
  let reactions = $state(false);
  let level = $state(0);

  $effect(() => {
    void fire.frame;
    level = media.level;
  });

  const send = (event: SubmitEvent) => {
    event.preventDefault();
    const line = text.trim();
    if (!line) return;
    text = "";
    void fire.chat(line, toSpirit && spirit.present).then((sent) => {
      if (!sent && !text) text = line;
    });
  };
</script>

<div class="dock">
  <form class="say" onsubmit={send}>
    {#if spirit.present}
      <button
        type="button"
        class="aim"
        class:on={toSpirit}
        aria-pressed={toSpirit}
        title={t.toSpirit}
        onclick={() => (toSpirit = !toSpirit)}
      >
        <Flame size={15} />
        <span>{t.toSpiritShort}</span>
      </button>
    {/if}
    <input bind:value={text} placeholder={toSpirit && spirit.present ? t.askSpirit : t.chatPlaceholder} maxlength="240" aria-label={t.chat} enterkeyhint="send" />
    <button class="icon-button send" type="submit" disabled={!text.trim()} aria-label={t.send}>
      <Send size={16} />
    </button>
  </form>

  <div class="bar" role="toolbar" aria-label={t.controls}>
    <div class="group">
      <button
        class="tool mic"
        class:on={media.mic}
        style:--level={level}
        type="button"
        aria-pressed={media.mic}
        onclick={() => void media.toggleMic()}
        title={media.mic ? t.micOff : t.micOn}
      >
        {#if media.mic}<Mic size={18} />{:else}<MicOff size={18} />{/if}
      </button>
      <button class="tool" class:on={media.cam} type="button" aria-pressed={media.cam} onclick={() => void media.toggleCam()} title={media.cam ? t.camOff : t.camOn}>
        {#if media.cam}<Video size={18} />{:else}<VideoOff size={18} />{/if}
      </button>
      {#if canShare}
        <button class="tool" class:on={media.screen} type="button" aria-pressed={media.screen} onclick={() => void media.toggleScreen()} title={media.screen ? t.shareOff : t.shareOn}>
          {#if media.screen}<ScreenShareOff size={18} />{:else}<ScreenShare size={18} />{/if}
        </button>
      {/if}
    </div>

    <div class="group">
      <button class="tool fire" type="button" disabled={cooling > 0} onclick={() => void fire.feed()} title={t.feed}>
        <FlameKindling size={18} />
        {#if cooling > 0}<span class="count">{cooling}</span>{/if}
      </button>
      <div class="react">
        <button class="tool" class:on={reactions} type="button" aria-expanded={reactions} onclick={() => (reactions = !reactions)} title={t.react}>
          <Sparkles size={18} />
        </button>
        {#if reactions}
          <div class="emotes">
            {#each EMOTES as emoji (emoji)}
              <button type="button" onclick={() => fire.react(emoji)} aria-label={emoji}>{emoji}</button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="group">
      {#if spirit.present}
        <button class="tool labelled" type="button" onclick={() => void spirit.dismiss()} title={t.dismissSpirit}>
          <Flame size={18} /><span>{t.spiritHere}</span>
        </button>
      {:else}
        <button class="tool labelled" class:busy={spirit.summoning} type="button" disabled={spirit.summoning} onclick={() => void spirit.summon()} title={t.summonHint}>
          <Flame size={18} /><span>{spirit.summoning ? t.summoning : t.summon}</span>
        </button>
      {/if}
      <button class="tool" class:on={panel === "sketch"} type="button" aria-pressed={panel === "sketch"} onclick={() => onPanel("sketch")} title={t.sketch}>
        <PencilLine size={18} />
        {#if fire.sketch.state.playing && panel !== "sketch"}<span class="dot"></span>{/if}
      </button>
      <button class="tool" class:on={panel === "log"} type="button" aria-pressed={panel === "log"} onclick={() => onPanel("log")} title={t.log}>
        <ScrollText size={18} />
      </button>
    </div>
  </div>
</div>

<style>
  .dock {
    position: absolute;
    left: 50%;
    bottom: max(14px, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    width: min(640px, calc(100% - 20px));
    display: grid;
    gap: 8px;
    z-index: 4;
  }

  .say {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 5px 5px 14px;
    border-radius: 999px;
    background: oklch(18% 0.03 258 / 0.86);
    border: 1px solid oklch(42% 0.03 258 / 0.5);
    backdrop-filter: blur(12px);
  }

  .say:focus-within {
    border-color: oklch(62% 0.1 60 / 0.7);
  }

  .say input {
    flex: 1;
    min-width: 0;
    padding: 0.45em 0;
    border: 0;
    background: none;
  }

  .say input:focus {
    outline: none;
  }

  .aim {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: -8px;
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 0.78rem;
    color: var(--mist-dim);
    transition: background 0.2s var(--ease-out), color 0.2s var(--ease-out);
  }

  .aim.on {
    color: var(--ember-100);
    background: oklch(40% 0.1 50 / 0.7);
  }

  .send:disabled {
    opacity: 0.35;
  }

  .bar {
    display: flex;
    justify-content: center;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .group {
    display: flex;
    gap: 2px;
    padding: 4px;
    border-radius: 999px;
    background: oklch(18% 0.03 258 / 0.86);
    border: 1px solid oklch(42% 0.03 258 / 0.5);
    backdrop-filter: blur(12px);
  }

  .tool {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-width: 40px;
    height: 40px;
    padding: 0 10px;
    border-radius: 999px;
    color: var(--mist-dim);
    transition: background 0.2s var(--ease-out), color 0.2s var(--ease-out);
  }

  .tool:hover:not(:disabled) {
    color: var(--mist);
    background: oklch(28% 0.03 258 / 0.9);
  }

  .tool.on {
    color: var(--ember-100);
    background: oklch(36% 0.08 52 / 0.75);
  }

  .tool:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .mic.on {
    box-shadow: 0 0 0 calc(var(--level, 0) * 6px) oklch(76% 0.14 62 / 0.45);
  }

  .labelled span {
    font-size: 0.84rem;
    white-space: nowrap;
  }

  .fire {
    color: var(--ember-300);
  }

  .count {
    position: absolute;
    right: 3px;
    bottom: 2px;
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: var(--mist-dim);
  }

  .busy span {
    animation: breathe 1.4s infinite;
  }

  .dot {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ember-500);
  }

  .react {
    position: relative;
  }

  .emotes {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    padding: 5px;
    border-radius: 999px;
    background: oklch(20% 0.03 258 / 0.95);
    border: 1px solid oklch(42% 0.03 258 / 0.5);
    animation: pop 0.25s var(--ease-out);
  }

  .emotes button {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    font-size: 1.25rem;
    transition: transform 0.15s var(--ease-out), background 0.15s var(--ease-out);
  }

  .emotes button:hover {
    transform: translateY(-2px) scale(1.12);
    background: oklch(30% 0.03 258);
  }

  @keyframes pop {
    from {
      opacity: 0;
      translate: 0 6px;
    }
  }

  @keyframes breathe {
    50% {
      opacity: 0.45;
    }
  }

  @media (max-width: 640px) {
    .bar {
      justify-content: flex-start;
    }

    .labelled span {
      display: none;
    }
  }
</style>
