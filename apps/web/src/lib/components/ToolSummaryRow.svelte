<script lang="ts">
import { ChevronDown, ChevronRight } from "lucide-svelte";
import StatusGlyph from "$lib/components/StatusGlyph.svelte";
import type { ToolCallsSummary } from "$lib/components/tool-call-format";
import { getLocale } from "$lib/i18n/locale.svelte";
import { m } from "$lib/paraglide/messages.js";

type Props = {
	label: string;
	summary: ToolCallsSummary;
	open: boolean;
	onToggle: () => void;
};

const { label, summary, open, onToggle }: Props = $props();
const locale = $derived(getLocale());
const tone = $derived(
	summary.running ? "activity" : summary.failed ? "error" : "success",
);
</script>

<button
	type="button"
	class="relative flex min-h-7 w-full items-center gap-2 rounded-md py-1 px-0 text-left transition-colors duration-150 hover:bg-bg-hover/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/35"
	aria-expanded={open}
	onclick={onToggle}
>
	<StatusGlyph {tone} motion={summary.running ? "active" : "none"} soft={tone === "success"} class="[--status-glyph-size:6px]" />
	<span class="shrink-0 text-[13px] text-text-tertiary tabular-nums">{label}</span>
	<span class="min-w-0 flex-1 truncate font-mono text-[13px] text-text-placeholder">{summary.names}</span>
	{#if summary.failed > 0}
		<span class="ml-auto shrink-0 text-[11px] tabular-nums text-status-error">{m.tool_failed_count({ count: summary.failed }, { locale })}</span>
	{/if}
	<span class="shrink-0 text-text-tertiary">
		{#if open}<ChevronDown class="h-3.5 w-3.5" />{:else}<ChevronRight class="h-3.5 w-3.5" />{/if}
	</span>
</button>
