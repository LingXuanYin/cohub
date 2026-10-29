<script lang="ts">
import { CornerDownRight } from "lucide-svelte";
import RelatedSessionLink from "$lib/components/RelatedSessionLink.svelte";
import SpaceAvatar from "$lib/components/SpaceAvatar.svelte";
import { getLocale } from "$lib/i18n/locale.svelte";
import { m } from "$lib/paraglide/messages.js";
import type { RelayTarget } from "$lib/relay";
import { getSpaceAvatarUrl } from "$lib/space-profile";
import { getCachedSpaceRecord } from "$lib/stores/space-record-cache";

const { target }: { target: RelayTarget } = $props();

const locale = $derived(getLocale());
let avatarUrl = $state<string | null>(null);

$effect(() => {
	const spaceId = target.spaceId;
	let active = true;
	avatarUrl = null;
	void getCachedSpaceRecord(spaceId).then((cached) => {
		if (active && cached) avatarUrl = getSpaceAvatarUrl(cached.space);
	});
	return () => {
		active = false;
	};
});
</script>

<div class="mb-1 flex min-w-0 items-center gap-1.5 px-3 pt-0.5 text-[12px] leading-6 text-text-tertiary" data-drawer-swipe-ignore>
	<CornerDownRight class="h-3.5 w-3.5 shrink-0 text-brand/70" aria-hidden="true" />
	<span class="shrink-0">{m.relay_to({}, { locale })}</span>
	<SpaceAvatar size="xxs" name={target.label} seed={target.spaceId} {avatarUrl} />
	<span class="min-w-[3em] max-w-[12em] shrink truncate font-medium text-text-secondary">{target.label}</span>
	<span class="shrink-0" aria-hidden="true">·</span>
	{#if target.sessionId}
		<RelatedSessionLink
			ref={{ spaceId: target.spaceId, sessionId: target.sessionId }}
			class="min-w-0 truncate transition-colors [&[href]]:hover:text-text-secondary"
		>
			{#snippet children({ label })}<span class="truncate">{label}</span>{/snippet}
		</RelatedSessionLink>
	{:else}
		<span class="min-w-0 truncate">{m.relay_new_chat({}, { locale })}</span>
	{/if}
</div>
