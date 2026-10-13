<script lang="ts">
import { onMount, tick } from "svelte";
import { Check, FastForward } from "lucide-svelte";
import PixelCompanion from "./PixelCompanion.svelte";
import { MotionScope } from "./motion";
import * as m from "./paraglide/messages.js";
const {
	title,
	from,
	to,
}: { title: string; from: DOMRect | null; to: DOMRect | null } = $props();
let island: HTMLDivElement;
let scope: MotionScope | null = null;
let playing = $state(false);
onMount(() => {
	const motion = new MotionScope();
	scope = motion;
	let alive = true;
	void tick().then(async () => {
		if (!alive || motion.reduced) return;
		playing = true;
		const at = island.getBoundingClientRect();
		if (from)
			for (let i = 0; i < 5; i++)
				motion.fly(from, at, "var(--accent)", "pull", i * 35);
		const mascot = island.querySelector(".pixel-companion");
		if (mascot)
			motion.animate(
				mascot,
				[
					{ transform: "none" },
					{ transform: "translateY(-5px) rotate(-4deg)" },
					{ transform: "none" },
				],
				{ duration: 400, delay: 300, easing: "steps(6)" },
			);
		if (to)
			for (let i = 0; i < 5; i++)
				motion.fly(at, to, "var(--accent)", "toss", 540 + i * 35);
		await motion.animate(
			island,
			[
				{ opacity: 0, transform: "translateY(-10px) scale(.97)" },
				{ opacity: 1, transform: "none", offset: 0.2 },
				{ opacity: 1, transform: "none" },
			],
			{ duration: 1200 },
		);
		if (alive) playing = false;
	});
	return () => {
		alive = false;
		motion.dispose();
		scope = null;
	};
});
</script>

<div class="discovery-island" bind:this={island} role="status">
  <PixelCompanion size={24} />
  <div>
    <small>{playing ? m.motion_organize() : m.dialogue_saved()}</small><strong>{title}</strong>
  </div>
  {#if playing}<button
      aria-label={m.motion_skip()}
      onclick={() => {
        scope?.finish();
        playing = false;
      }}><FastForward size={15} /></button
    >{:else}<Check size={15} />{/if}
</div>
