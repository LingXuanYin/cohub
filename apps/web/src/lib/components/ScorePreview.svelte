<script lang="ts">
import CenteredLoading from "$lib/components/CenteredLoading.svelte";
import ScoreEditorHost from "$lib/components/ScoreEditorHost.svelte";
import { getLocale } from "$lib/i18n/locale.svelte";
import { m } from "$lib/paraglide/messages.js";
import { scoreFileProject } from "$lib/score-editor/song-project";

/**
 * A score file as the score editor shows it, read-only. `source` is the file's current text, so a
 * change to the file reaches the editor without remounting it.
 */
const { path, source }: { path: string; source: string } = $props();

const locale = $derived(getLocale());
const project = $derived(scoreFileProject(path, source));

let failed = $state(false);
let ready = $state(false);
</script>

<div class="relative min-h-0 flex-1" data-drawer-swipe-ignore>
	{#if failed}
		<div class="flex h-full flex-col items-center justify-center gap-2 px-4 text-center" role="alert">
			<div class="text-[12px] text-error-soft">{m.score_editor_load_failed({}, { locale })}</div>
			<button type="button" class="action-btn" onclick={() => (failed = false)}>{m.common_retry({}, { locale })}</button>
		</div>
	{:else}
		<ScoreEditorHost
			{project}
			editable={false}
			onFailed={() => (failed = true)}
			bind:ready
			class="absolute inset-0"
		/>
		{#if !ready}
			<CenteredLoading label={m.score_editor_loading({}, { locale })} size="panel" class="h-full" />
		{/if}
	{/if}
</div>
