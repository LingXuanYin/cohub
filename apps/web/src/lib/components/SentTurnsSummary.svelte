<script lang="ts">
import { ArrowUpRight } from "lucide-svelte";
import RelatedSessionLink from "$lib/components/RelatedSessionLink.svelte";
import { getLocale } from "$lib/i18n/locale.svelte";
import { m } from "$lib/paraglide/messages.js";
import { NO_SENT_SESSIONS, summarizeSentSessions } from "$lib/sent-turns";
import { useSessionRelations } from "$lib/session-relations-context";

const { turnId }: { turnId: string } = $props();

const locale = $derived(getLocale());
const relations = useSessionRelations();
const sessions = $derived(relations?.sentByTurn(turnId) ?? NO_SENT_SESSIONS);

let expanded = $state(false);
const parts = $derived(summarizeSentSessions(sessions, locale, { expanded }));

const target =
	"inline-flex min-w-0 max-w-[min(16em,100%)] items-center gap-1 font-medium text-text-secondary underline-offset-2 transition-colors";
</script>

{#if sessions.length > 0}
	<p class="flex flex-wrap items-center px-[var(--chat-msg-inset)] text-[13px] leading-6 text-text-tertiary">
		<ArrowUpRight class="mr-1 h-3.5 w-3.5 shrink-0 text-brand/70" aria-hidden="true" />
		<span class="whitespace-pre">{m.sent_to_label({}, { locale })} </span>
		{#each parts as part, index (index)}
			{#if part.kind === "text"}
				<span class="whitespace-pre">{part.text}</span>
			{:else if part.kind === "more"}
				<button type="button" class="{target} cursor-pointer hover:text-text-primary hover:underline hover:decoration-brand/35" onclick={() => (expanded = true)}>
					{m.sent_to_more({ count: part.count }, { locale })}
				</button>
			{:else}
				<RelatedSessionLink ref={part.session} class="{target} [&[href]]:hover:text-text-primary [&[href]]:hover:underline [&[href]]:hover:decoration-brand/35">
					{#snippet children({ label, status })}
						{#if status === "loading"}
							<span class="h-3 w-20 rounded-[3px] bg-bg-surface" aria-hidden="true"></span>
						{:else}
							<span class="min-w-0 truncate {status === 'unavailable' ? 'font-normal text-text-placeholder' : ''}">{label}</span>
						{/if}
						{#if part.session.count > 1}
							<span class="shrink-0 font-normal tabular-nums text-text-placeholder">×{part.session.count}</span>
						{/if}
					{/snippet}
				</RelatedSessionLink>
			{/if}
		{/each}
	</p>
{/if}
