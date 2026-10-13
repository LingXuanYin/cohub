<script lang="ts">
  import { Campfire } from "./fire.svelte";
  import Actors from "./ui/Actors.svelte";
  import Dock from "./ui/Dock.svelte";
  import Lobby from "./ui/Lobby.svelte";
  import Log from "./ui/Log.svelte";
  import Scene from "./ui/Scene.svelte";
  import Screen from "./ui/Screen.svelte";
  import Sketch from "./ui/Sketch.svelte";
  import TopBar from "./ui/TopBar.svelte";

  let { fire = new Campfire() }: { fire?: Campfire } = $props();
  let panel = $state<"sketch" | "log" | null>(null);

  $effect(() => {
    void fire.boot();
    return () => fire.dispose();
  });

  $effect(() => {
    if (fire.sketch.open) {
      panel = "sketch";
      fire.sketch.open = false;
    }
  });

  $effect(() => {
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target as HTMLElement | null)?.isContentEditable;
    const down = (event: KeyboardEvent) => {
      if (fire.phase !== "fire" || typing(event.target) || event.metaKey || event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        fire.meadow.keys.add(key);
        event.preventDefault();
      }
    };
    const up = (event: KeyboardEvent) => fire.meadow.keys.delete(event.key.toLowerCase());
    const blur = () => fire.meadow.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  });

  const toggle = (next: "sketch" | "log") => {
    panel = panel === next ? null : next;
  };
</script>

<main class="stage">
  <Scene meadow={fire.meadow} interactive={fire.phase === "fire"} thinking={fire.spirit.member?.thinking ?? false} onTap={() => fire.media.wake()} />

  {#if fire.phase === "fire"}
    <Actors {fire} />
    <Screen {fire} />
    <TopBar {fire} />
    {#if panel === "sketch"}
      <Sketch {fire} onClose={() => (panel = null)} />
    {:else if panel === "log"}
      <Log {fire} onClose={() => (panel = null)} />
    {/if}
    <Dock {fire} {panel} onPanel={toggle} />
  {:else if fire.phase === "lobby" || fire.phase === "joining"}
    <Lobby {fire} />
  {:else if fire.phase === "broken"}
    <div class="broken">
      <p>{fire.bootError}</p>
    </div>
  {/if}
</main>

<style>
  .stage {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .broken {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    background: oklch(14% 0.03 258 / 0.7);
  }

  .broken p {
    max-width: 36ch;
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.2rem;
    text-align: center;
    color: var(--ember-100);
  }
</style>
