<script lang="ts">
  import { Maximize2, Minimize2 } from "@lucide/svelte";
  import type { Campfire } from "../fire.svelte";

  type Props = { fire: Campfire };

  let { fire }: Props = $props();
  const t = $derived(fire.t);
  const media = $derived(fire.media);
  const screen = $derived(media.screens[0] ?? null);
  const enlarged = $derived(screen !== null && media.stage === screen.participantId);
  let video = $state<HTMLVideoElement | null>(null);

  $effect(() => {
    const element = video;
    const track = screen?.track;
    if (!element || !track) return;
    element.srcObject = new MediaStream([track]);
    void element.play().catch(() => undefined);
    return () => {
      element.srcObject = null;
    };
  });

  const toggle = () => {
    if (!screen) return;
    media.stage = enlarged ? null : screen.participantId;
  };

  $effect(() => {
    if (!enlarged) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") media.stage = null;
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
</script>

{#if screen}
  <figure class="sheet" class:enlarged>
    <video bind:this={video} muted playsinline autoplay></video>
    <figcaption>
      <span>{t.sharing(fire.names.get(screen.participantId) ?? t.traveler)}</span>
      <button class="icon-button" type="button" onclick={toggle} aria-label={enlarged ? t.shrink : t.enlarge}>
        {#if enlarged}<Minimize2 size={15} />{:else}<Maximize2 size={15} />{/if}
      </button>
    </figcaption>
  </figure>
{/if}

<style>
  .sheet {
    position: absolute;
    top: max(64px, calc(env(safe-area-inset-top) + 52px));
    left: 50%;
    width: min(380px, 46vw);
    margin: 0;
    transform: translateX(-50%) perspective(900px) rotateX(6deg);
    transform-origin: top center;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--night-800);
    box-shadow: 0 30px 60px -30px oklch(10% 0.03 258), 0 0 50px -16px oklch(72% 0.14 60 / 0.35);
    z-index: 3;
    transition: width 0.45s var(--ease-out), transform 0.45s var(--ease-out);
    animation: unfurl 0.6s var(--ease-out);
  }

  .sheet.enlarged {
    width: min(1100px, calc(100% - 40px));
    transform: translateX(-50%);
    z-index: 7;
  }

  video {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: contain;
    background: oklch(12% 0.02 258);
  }

  figcaption {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 6px 4px 12px;
    font-size: 0.78rem;
    color: var(--mist-dim);
  }

  @keyframes unfurl {
    from {
      opacity: 0;
      clip-path: inset(0 0 100% 0);
    }
  }

  @media (max-width: 640px) {
    .sheet {
      width: calc(100% - 120px);
    }
  }
</style>
