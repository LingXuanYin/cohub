<script lang="ts">
  type Props = { track: MediaStreamTrack; mirrored: boolean };

  let { track, mirrored }: Props = $props();
  let video = $state<HTMLVideoElement | null>(null);

  $effect(() => {
    const element = video;
    if (!element) return;
    element.srcObject = new MediaStream([track]);
    void element.play().catch(() => undefined);
    return () => {
      element.srcObject = null;
    };
  });
</script>

<div class="bubble" class:mirrored>
  <video bind:this={video} muted playsinline autoplay></video>
</div>

<style>
  .bubble {
    width: var(--bubble, 96px);
    aspect-ratio: 1;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid var(--ember, var(--ember-500));
    background: var(--night-800);
    box-shadow: 0 12px 28px -14px oklch(10% 0.03 258 / 0.9), 0 0 24px -8px oklch(72% 0.14 60 / 0.4);
    animation: open 0.45s var(--ease-out);
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .mirrored video {
    transform: scaleX(-1);
  }

  @keyframes open {
    from {
      opacity: 0;
      scale: 0.85;
    }
  }
</style>
