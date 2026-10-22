<script lang="ts">
import { getLocale } from "$lib/i18n/locale.svelte";
import { m } from "$lib/paraglide/messages.js";

/** A centred message that stands where the score would be, with Retry when trying again can help. */
const {
	message,
	onRetry,
	class: className = "",
}: {
	message: string;
	onRetry?: () => void;
	class?: string;
} = $props();

const locale = $derived(getLocale());
</script>

<div class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center {className}" role="alert">
	<p class="text-[13px] leading-5 text-text-secondary">{message}</p>
	{#if onRetry}
		<button type="button" class="secondary-key min-h-9 px-3.5 text-[12px] [@media(pointer:coarse)]:min-h-11" onclick={onRetry}>
			{m.common_retry({}, { locale })}
		</button>
	{/if}
</div>
