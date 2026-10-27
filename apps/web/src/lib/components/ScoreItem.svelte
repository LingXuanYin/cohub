<script lang="ts">
import EntityIcon from "$lib/components/EntityIcon.svelte";
import { getLocale } from "$lib/i18n/locale.svelte";
import { m } from "$lib/paraglide/messages.js";
import { getScoreEditorHost } from "$lib/score-editor/score-editor-host";
import type { TaskScoreEntry } from "$lib/score-editor/task-score";

type Props = {
	entry: TaskScoreEntry;
	/** `chip` sits in a line of content; `tile` fills a cell of the generation grid. */
	variant: "chip" | "tile";
	/** Which song this is, when several items share a view. */
	subject?: string;
};

const { entry, variant, subject = "" }: Props = $props();

const host = getScoreEditorHost();
const locale = $derived(getLocale());
const label = $derived(m.score_item({}, { locale }));
const named = $derived(
	subject ? m.score_item_named({ title: subject }, { locale }) : undefined,
);

let opening = $state(false);
let unavailable = $state(false);

$effect(() => {
	entry.taskRunId;
	unavailable = false;
});

async function open() {
	if (!host?.enabled) {
		unavailable = true;
		return;
	}
	opening = true;
	const result = await host.open(entry.taskRunId);
	opening = false;
	if (!result.ok && result.unavailable) unavailable = true;
}
</script>

{#if unavailable}
	{#if variant === "tile"}
		<div class="grid-tile score-tile score-tile--text">
			<pre>{entry.score}</pre>
		</div>
	{:else}
		<div class="whitespace-pre-wrap break-words text-[13px] leading-6 text-text-secondary">{entry.score}</div>
	{/if}
{:else}
	<button
		type="button"
		class={variant === "tile"
			? "grid-tile score-tile"
			: "secondary-key min-h-9 shrink-0 gap-1.5 px-3 py-2 text-[12px] focus-visible:outline-brand [@media(pointer:coarse)]:min-h-11"}
		title={named}
		aria-label={named}
		aria-busy={opening}
		onclick={open}
	>
		{#if variant === "tile"}
			<EntityIcon name="score" class="h-5 w-5 text-text-tertiary" />
			<span class="score-tile-label">{label}</span>
		{:else}
			<EntityIcon name="score" class="h-3.5 w-3.5" />
			<span>{label}</span>
		{/if}
	</button>
{/if}

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

	/* Solid: at the sibling tile's half strength the ring measured under 3:1 against the surround. */
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

	.score-tile--text {
		align-items: stretch;
		justify-content: flex-start;
		padding: 8px;
		cursor: default;
	}

	.score-tile--text pre {
		margin: 0;
		overflow: auto;
		font-family: var(--font-mono);
		font-size: 10px;
		line-height: 14px;
		white-space: pre-wrap;
		word-break: break-all;
	}
</style>
