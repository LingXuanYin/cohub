<script lang="ts">
import type { ContentBlock } from "@cohub/protocol/core";
import type { MessageToolCallsFile } from "@cohub/protocol/model";
import { ChevronDown, ChevronRight } from "lucide-svelte";
import StatusGlyph, {
	type StatusGlyphTone,
} from "$lib/components/StatusGlyph.svelte";
import ToolCallItem from "$lib/components/ToolCallItem.svelte";
import {
	buildToolCallViewModels,
	summarizeToolCalls,
} from "$lib/components/tool-call-format";
import { getLocale } from "$lib/i18n/locale.svelte";
import { m } from "$lib/paraglide/messages.js";
import type { OpenWorkspaceFileTarget } from "$lib/workspace-file-links";

type Props = {
	content: ContentBlock[];
	toolCallsFile?: MessageToolCallsFile | null;
	streaming?: boolean;
	defaultExpanded?: boolean;
	onLoadToolCalls?: () => Promise<MessageToolCallsFile | null>;
	flush?: boolean;
	onOpenFile?: (target: OpenWorkspaceFileTarget) => void;
};

const {
	content,
	toolCallsFile = null,
	streaming = false,
	defaultExpanded = false,
	onLoadToolCalls,
	flush = false,
	onOpenFile,
}: Props = $props();

const locale = $derived(getLocale());

let loading = $state(false);
let loadError = $state<string | null>(null);
let loadedFile = $state<MessageToolCallsFile | null>(null);
let requestedLoad = $state(false);
let groupToggled = $state<boolean | null>(null);

const effectiveFile = $derived(toolCallsFile ?? loadedFile);
const tools = $derived(
	buildToolCallViewModels({ content, toolCallsFile: effectiveFile }),
);
const collapsible = $derived(!defaultExpanded && tools.length > 1);
const groupOpen = $derived(!collapsible || (groupToggled ?? streaming));
const summary = $derived(collapsible ? summarizeToolCalls(tools) : null);
const summaryTone = $derived<StatusGlyphTone>(
	summary?.running ? "activity" : summary?.failed ? "error" : "success",
);

async function ensureLoaded() {
	if (!onLoadToolCalls || effectiveFile || loading) return;
	requestedLoad = true;
	loading = true;
	loadError = null;
	try {
		loadedFile = await onLoadToolCalls();
	} catch (error) {
		loadError =
			error instanceof Error
				? error.message
				: m.tool_load_failed({}, { locale });
	} finally {
		loading = false;
	}
}

function retryLoad() {
	requestedLoad = false;
	void ensureLoaded();
}
</script>

{#if tools.length > 0}
	<div class={flush ? "space-y-0.5" : "mt-2 space-y-0.5"}>
		{#if summary && (!groupOpen || groupToggled)}
			<button
				type="button"
				class="relative flex min-h-7 w-full items-center gap-2 rounded-md py-1 px-0 text-left transition-colors duration-150 hover:bg-bg-hover/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/35"
				aria-expanded={groupOpen}
				onclick={() => (groupToggled = !groupOpen)}
			>
				<StatusGlyph tone={summaryTone} motion={summary.running ? "active" : "none"} soft={summaryTone === "success"} class="[--status-glyph-size:6px]" />
				<span class="shrink-0 text-[13px] text-text-tertiary tabular-nums">{m.process_tools_many({ count: tools.length }, { locale })}</span>
				<span class="min-w-0 flex-1 truncate font-mono text-[13px] text-text-placeholder">{summary.names}</span>
				{#if summary.failed > 0}
					<span class="ml-auto shrink-0 text-[11px] tabular-nums text-status-error">{m.tool_failed_count({ count: summary.failed }, { locale })}</span>
				{/if}
				<span class="shrink-0 text-text-tertiary">
					{#if groupOpen}<ChevronDown class="h-3.5 w-3.5" />{:else}<ChevronRight class="h-3.5 w-3.5" />{/if}
				</span>
			</button>
		{/if}
		{#if groupOpen}
			{#if loadError}
				<button type="button" class="ml-[26px] mb-1 rounded-md border border-status-error/30 bg-status-error/5 px-2 py-1 text-left text-[12px] leading-snug text-status-error hover:bg-status-error/10" onclick={retryLoad}>
					{loadError} · {m.common_retry({}, { locale })}
				</button>
			{/if}
			<div class={groupToggled === true ? "ml-[3px] space-y-0.5 border-l border-border-subtle/70 pl-[11px]" : "space-y-0.5"}>
				{#each tools as tool (tool.id)}
					<ToolCallItem {tool} loading={loading && requestedLoad && !effectiveFile} needsDetails={Boolean(onLoadToolCalls) && !effectiveFile} defaultExpanded={defaultExpanded || (streaming && tool.status === 'running')} autoExpandWhileRunning={streaming} onExpand={ensureLoaded} {onOpenFile} />
				{/each}
			</div>
		{/if}
	</div>
{/if}
