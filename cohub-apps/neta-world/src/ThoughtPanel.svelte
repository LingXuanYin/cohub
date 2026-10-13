<script lang="ts">
import { onMount, tick } from "svelte";
import PixelCompanion from "./PixelCompanion.svelte";
import { MotionScope } from "./motion";
import {
	ArrowUpRight,
	ChevronRight,
	Sparkles,
	SquarePen,
	X,
} from "lucide-svelte";
import type { Card } from "./world";
import { kindLabel } from "./world";
import type { Suggestion } from "./creation";
import * as m from "./paraglide/messages.js";
const {
	selected,
	suggestions,
	words,
	position,
	busy,
	onClose,
	onAccept,
	onEdit,
	onCompose,
	onConversation,
	onRead,
	source,
}: {
	selected: Card[];
	suggestions: Suggestion[];
	words: string[];
	position: { x: number; y: number } | null;
	busy: boolean;
	onClose(): void;
	onAccept(index: number): void;
	onEdit(): void;
	onCompose(): void;
	onConversation(): void;
	onRead(ids: string[]): void;
	source: DOMRect | null;
} = $props();
let panel: HTMLElement;
let mascot: HTMLDivElement;
let revealing = $state(false);
let motion: MotionScope | null = null;
function finish() {
	motion?.finish();
	revealing = false;
}
onMount(() => {
	const scope = new MotionScope();
	motion = scope;
	let alive = true;
	void tick().then(async () => {
		if (!alive || scope.reduced) return;
		revealing = true;
		scope.animate(
			mascot,
			[
				{ transform: "translateY(-18px)", opacity: 0 },
				{ transform: "none", opacity: 1 },
			],
			{ duration: 360, easing: "steps(6)" },
		);
		const cloud = panel.querySelector(".word-cloud");
		if (source && cloud)
			for (let i = 0; i < 4; i++)
				scope.fly(
					source,
					cloud.getBoundingClientRect(),
					"var(--accent)",
					"toss",
					i * 60,
				);
		const from = mascot.getBoundingClientRect();
		const rows = [
			...panel.querySelectorAll<HTMLElement>(".suggestion-list > button"),
		];
		const kinds = ["toss", "pull", "stomp"] as const;
		rows.forEach((row, index) => {
			const delay = 200 + index * 210;
			scope.fly(
				from,
				row.getBoundingClientRect(),
				"var(--accent)",
				kinds[index % 3],
				delay,
			);
			scope.animate(
				row,
				[
					{ transform: "translateY(9px)", opacity: 0.15 },
					{ transform: "none", opacity: 1 },
				],
				{ duration: 300, delay: delay + 300, fill: "backwards" },
			);
			const mask = row.querySelector(".decode-mask");
			if (mask)
				scope.animate(
					mask,
					[
						{ transform: "scaleX(1)", opacity: 1 },
						{ transform: "scaleX(.15)", opacity: 0.8, offset: 0.65 },
						{ transform: "scaleX(0)", opacity: 0 },
					],
					{
						duration: 340,
						delay: delay + 360,
						easing: "steps(9)",
						fill: "backwards",
					},
				);
		});
		await scope.animate(
			mascot,
			[
				{ transform: "none" },
				{ transform: "translateY(-6px) rotate(-4deg)" },
				{ transform: "none" },
			],
			{ duration: 300, delay: rows.length ? 950 : 300, easing: "steps(6)" },
		);
		if (alive) revealing = false;
	});
	return () => {
		alive = false;
		scope.dispose();
		motion = null;
	};
});
</script>

<section
  class="thought-panel"
  bind:this={panel}
  aria-label={m.suggestions()}
  style:left={position ? `${position.x}px` : undefined}
  style:top={position ? `${position.y}px` : undefined}
>
  <header>
    <span
      ><div class="thought-mascot" bind:this={mascot}><PixelCompanion /></div>
      {revealing ? m.thinking() : selected.length > 1 ? m.fusion_title() : m.suggestions()}</span
    >
    {#if revealing}<button class="motion-skip" onclick={finish}>{m.motion_skip()}</button>{/if}
    <button class="icon-button" aria-label={m.close()} onclick={onClose}><X size={16} /></button>
  </header>
  <div class="word-cloud" aria-hidden="true">
    {#each words as word, i}<span style:--i={i} class:large={i < 2}>{word}</span>{/each}
  </div>
  {#if selected.length > 1}<div class="fusion-preview">
      <p>{selected.map((card) => card.title).join(' + ')}</p>
      <small>{m.fusion_hint()}</small><button class="primary" disabled={busy} onclick={onCompose}
        ><Sparkles size={16} />{m.fuse()}</button
      >
    </div>
  {:else}<div class="suggestion-list">
      {#each suggestions as suggestion, i}<button
          disabled={busy}
          onpointerenter={() => onRead(suggestion.basis.map((card) => card.id))}
          onfocus={() => onRead(suggestion.basis.map((card) => card.id))}
          onclick={() => {
            finish();
            onAccept(i);
          }}
          class:recommended={i === 0}
          ><span class="suggestion-number">0{i + 1}</span><span
            ><strong class="decoded-title"
              >{suggestion.title}<i class="decode-mask" aria-hidden="true"></i></strong
            ><small>{i === 0 ? m.recommend() : kindLabel(suggestion.kind)}</small></span
          ><ArrowUpRight size={15} /></button
        >{/each}
    </div>
    <details class="suggestion-basis">
      <summary>{m.record_basis()}</summary>{#each suggestions[0]?.basis ?? [] as source}<p>
          <strong>{source.title}</strong><br />{source.body}
        </p>{/each}
    </details>
    <p class="suggestion-reason">
      {suggestions[0]?.reason}<br /><small>{m.creation_local_hint()}</small>
    </p>
    <button class="write-own" disabled={busy} onclick={onEdit}
      >{m.edit_card()}<SquarePen size={14} /></button
    ><button class="write-own" disabled={busy} onclick={onCompose}
      >{m.intent()}<ChevronRight size={14} /></button
    >
  {/if}
  <button class="write-own" disabled={busy} onclick={onConversation}
    >{m.build_dialogue()}<ChevronRight size={14} /></button
  >
</section>
