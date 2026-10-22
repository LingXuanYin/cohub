<script lang="ts">
import EntityIcon from "$lib/components/EntityIcon.svelte";
import { getLocale } from "$lib/i18n/locale.svelte";
import { m } from "$lib/paraglide/messages.js";
import { scoreEditorLayer } from "$lib/score-editor/layer.svelte";
import type { ScoreEditorEntry } from "$lib/score-editor/song-project";

type Props = {
	entry: ScoreEditorEntry;
	/** `chip` is an inline button, beside the audio in chat or in place of the score text in the task detail; `tile` fills a cell of the generation grid. */
	variant: "chip" | "tile";
	/** Which song this is, for the tooltip and assistive technology when several items share a view. */
	subject?: string;
};

const { entry, variant, subject = "" }: Props = $props();

const locale = $derived(getLocale());
const label = $derived(m.generation_role_abc({}, { locale }));
const named = $derived(
	subject ? m.score_item_named({ title: subject }, { locale }) : undefined,
);
</script>

<button
	type="button"
	class={variant === "tile"
		? "grid-tile score-tile"
		: "secondary-key min-h-9 shrink-0 gap-1.5 px-3 py-2 text-[12px] focus-visible:outline-brand [@media(pointer:coarse)]:min-h-11"}
	title={named}
	aria-label={named}
	aria-haspopup="dialog"
	onclick={(event) => scoreEditorLayer.show(entry.taskRunId, event.currentTarget)}
>
	{#if variant === "tile"}
		<EntityIcon name="score" class="h-5 w-5 text-text-tertiary" />
		<span class="score-tile-label">{label}</span>
	{:else}
		<EntityIcon name="score" class="h-3.5 w-3.5" />
		<span>{label}</span>
	{/if}
</button>

<style>
	.score-tile {
		display: flex;
		width: 100%;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		color: var(--text-secondary);
		cursor: pointer;
		transition: color 100ms ease, background-color 100ms ease;
	}

	.score-tile:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	/* Solid: at the half strength of the sibling tile's ring the ring measured 2.08:1 (light) and 1.74:1 (dark) against the surround, under the 3:1 a focus indicator needs. */
	.score-tile:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: -2px;
	}

	.score-tile-label {
		max-width: 100%;
		overflow: hidden;
		padding: 0 4px;
		font-size: 11px;
		line-height: 16px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
