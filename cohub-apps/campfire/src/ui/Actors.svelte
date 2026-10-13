<script lang="ts">
  import type { Campfire } from "../fire.svelte";
  import type { Actor } from "../meadow";
  import CameraBubble from "./CameraBubble.svelte";

  type Props = { fire: Campfire };

  let { fire }: Props = $props();

  type Body = {
    id: string;
    name: string;
    color: string;
    kind: Actor["kind"];
    self: boolean;
    mic: boolean;
    moving: boolean;
    level: number;
    transform: string;
    light: string;
    gaze: string;
  };

  const view = $derived.by(() => {
    void fire.frame;
    const meadow = fire.meadow;
    const now = performance.now();
    const bodies: Body[] = [...meadow.actors.values()]
      .filter((actor) => !actor.spirit)
      .sort((a, b) => a.y - b.y)
      .map((actor) => {
        const toFire = Math.atan2(-actor.y, -actor.x);
        return {
          id: actor.participantId,
          name: actor.name,
          color: actor.color,
          kind: actor.kind,
          self: actor.self,
          mic: actor.mic,
          moving: actor.moving,
          level: Math.round(actor.level * 50) / 50,
          transform: `translate3d(${meadow.projectX(actor.x).toFixed(1)}px, ${meadow.projectY(actor.y).toFixed(1)}px, 0)`,
          light: `${(50 + Math.cos(toFire) * 28).toFixed(0)}% ${(42 + Math.sin(toFire) * 22).toFixed(0)}%`,
          gaze: `translate(${(Math.cos(actor.angle) * 18).toFixed(0)}%, ${(Math.sin(actor.angle) * 14).toFixed(0)}%)`,
        };
      });
    return {
      scale: meadow.view.scale,
      bodies,
      bubbles: new Map(meadow.bubbles.map((bubble) => [bubble.participantId, bubble])),
      emotes: meadow.emotes.filter((emote) => now - emote.at < 2400),
      fire: `translate3d(${meadow.projectX(0).toFixed(1)}px, ${meadow.projectY(0).toFixed(1)}px, 0)`,
    };
  });

  const spirit = $derived(fire.spirit.member);
  const spiritLine = $derived(spirit ? view.bubbles.get(spirit.participantId) : undefined);
</script>

<div class="layer" aria-hidden="true" style:--unit="{view.scale}px">
  {#if spirit}
    <div class="spirit" style:transform={view.fire}>
      <span class="tag spirit-tag">{spirit.name}</span>
      {#if spirit.thinking}
        <span class="say spirit-say thinking"><i></i><i></i><i></i></span>
      {:else if spiritLine}
        {#key spiritLine.id}
          <p class="say spirit-say">{spiritLine.text}</p>
        {/key}
      {/if}
    </div>
  {/if}

  {#each view.bodies as body (body.id)}
    {@const camera = fire.media.cameraOf(body.id, body.self)}
    {@const bubble = view.bubbles.get(body.id)}
    <div class="actor" class:self={body.self} class:quiet={!body.mic} style:transform={body.transform} style:--ember={body.color}>
      <span class="shadow"></span>
      <span class="ring" style:--level={body.level}></span>
      <span class="body" class:walking={body.moving} style:--light={body.light}>
        <span class="eyes" style:transform={body.gaze}><i></i><i></i></span>
      </span>
      {#if camera}
        <div class="camera"><CameraBubble track={camera} mirrored={body.self} /></div>
      {/if}
      <span class="tag">
        {body.name}
        {#if body.kind !== "user"}<b>{body.kind}</b>{/if}
      </span>
      {#if bubble}
        {#key bubble.id}
          <p class="say" class:raised={Boolean(camera)}>{bubble.text}</p>
        {/key}
      {/if}
      {#each view.emotes.filter((emote) => emote.participantId === body.id) as emote (emote.id)}
        <span class="emote">{emote.emoji}</span>
      {/each}
    </div>
  {/each}
</div>

<style>
  .layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    --size: clamp(22px, calc(var(--unit) * 0.95), 44px);
  }

  .actor,
  .spirit {
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    will-change: transform;
  }

  .shadow {
    position: absolute;
    width: calc(var(--size) * 1.1);
    height: calc(var(--size) * 0.36);
    transform: translate(-50%, -30%);
    border-radius: 50%;
    background: oklch(12% 0.03 258 / 0.55);
    filter: blur(2px);
  }

  .ring {
    position: absolute;
    width: calc(var(--size) * 1.9);
    height: calc(var(--size) * 1.9);
    transform: translate(-50%, -62%) scale(calc(0.8 + var(--level) * 0.35));
    border-radius: 50%;
    border: 2px solid var(--ember);
    opacity: calc(var(--level) * 1.4);
  }

  .body {
    position: absolute;
    width: var(--size);
    height: calc(var(--size) * 1.18);
    transform: translate(-50%, -88%);
    border-radius: 50% 50% 46% 46% / 58% 58% 42% 42%;
    background:
      radial-gradient(circle at var(--light), oklch(100% 0.04 80 / 0.55), transparent 55%),
      radial-gradient(circle at 50% 30%, var(--ember), color-mix(in oklch, var(--ember), oklch(20% 0.04 258) 55%));
    box-shadow: inset 0 -4px 8px oklch(15% 0.03 258 / 0.45);
  }

  .body.walking {
    animation: bob 0.42s ease-in-out infinite alternate;
  }

  .quiet .body {
    filter: saturate(0.82);
  }

  .eyes {
    position: absolute;
    inset: 26% 22% auto;
    display: flex;
    justify-content: space-between;
    transition: transform 0.25s var(--ease-out);
  }

  .eyes i {
    width: 15%;
    aspect-ratio: 1;
    min-width: 3px;
    border-radius: 50%;
    background: oklch(18% 0.03 258);
    animation: blink 5.2s infinite;
  }

  .camera {
    position: absolute;
    left: 0;
    bottom: calc(var(--size) * 1.3);
    transform: translateX(-50%);
    --bubble: calc(var(--size) * 2.6);
  }

  .tag {
    position: absolute;
    top: calc(var(--size) * 0.35);
    transform: translateX(-50%);
    display: inline-flex;
    gap: 5px;
    align-items: baseline;
    padding: 1px 8px 2px;
    border-radius: 999px;
    background: oklch(16% 0.03 258 / 0.66);
    color: var(--mist);
    font-size: 0.72rem;
    white-space: nowrap;
  }

  .self .tag {
    color: var(--ember-100);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--ember), transparent 40%);
  }

  .tag b {
    font-family: var(--font-mono);
    font-weight: 400;
    font-size: 0.6rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ember-300);
  }

  .say {
    position: absolute;
    left: 0;
    bottom: calc(var(--size) * 1.45);
    transform: translateX(-50%);
    width: max-content;
    max-width: 24ch;
    margin: 0;
    padding: 6px 11px 7px;
    border-radius: 14px;
    background: oklch(95% 0.02 80);
    color: oklch(22% 0.03 258);
    font-size: 0.82rem;
    line-height: 1.35;
    box-shadow: 0 8px 22px -12px oklch(10% 0.03 258 / 0.9);
    animation: rise 0.35s var(--ease-out);
  }

  .say.raised {
    bottom: calc(var(--size) * 4.2);
  }

  .spirit .tag {
    top: calc(var(--unit) * 0.5);
  }

  .spirit-tag {
    font-family: var(--font-display);
    font-size: 0.8rem;
    color: var(--ember-100);
    background: oklch(30% 0.07 50 / 0.72);
  }

  .spirit-say {
    bottom: calc(var(--unit) * 3.2);
    max-width: 34ch;
    padding: 10px 15px 11px;
    border-radius: 18px;
    background: oklch(28% 0.06 52 / 0.94);
    color: var(--ember-100);
    font-family: var(--font-display);
    font-size: 0.98rem;
    line-height: 1.45;
    box-shadow: 0 0 40px -10px oklch(70% 0.16 60 / 0.6);
  }

  .thinking {
    display: inline-flex;
    gap: 5px;
    padding: 10px 14px;
  }

  .thinking i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ember-300);
    animation: ember 1.2s infinite;
  }

  .thinking i:nth-child(2) {
    animation-delay: 0.2s;
  }

  .thinking i:nth-child(3) {
    animation-delay: 0.4s;
  }

  .emote {
    position: absolute;
    left: 0;
    bottom: calc(var(--size) * 1.2);
    font-size: 1.5rem;
    animation: float 2.4s var(--ease-out) forwards;
  }

  @keyframes rise {
    from {
      opacity: 0;
      translate: 0 6px;
    }
  }

  @keyframes float {
    from {
      opacity: 0;
      transform: translate(-50%, 0) scale(0.6);
    }
    15% {
      opacity: 1;
      transform: translate(-50%, -14px) scale(1.1);
    }
    to {
      opacity: 0;
      transform: translate(-50%, -70px) scale(1);
    }
  }

  @keyframes bob {
    to {
      translate: 0 -2px;
    }
  }

  @keyframes blink {
    0%, 96%, 100% { scale: 1 1; }
    98% { scale: 1 0.1; }
  }

  @keyframes ember {
    0%, 100% { opacity: 0.3; translate: 0 0; }
    50% { opacity: 1; translate: 0 -3px; }
  }
</style>
