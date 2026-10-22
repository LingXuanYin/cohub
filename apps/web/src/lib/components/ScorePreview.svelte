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
// The editor would only report this as an unreadable score, so the empty file is named here.
const empty = $derived(source.trim() === "");

let failed = $state(false);
let ready = $state(false);
</script>

<!-- Only the mounted editor pans sideways, so only it keeps the phone's drawer swipe from starting. -->
<div class="relative min-h-0 flex-1" data-drawer-swipe-ignore={ready && !failed && !empty ? "" : undefined}>
	{#if failed}
		<div class="flex h-full flex-col items-center justify-center gap-2 px-4 text-center" role="alert">
			<div class="text-[12px] text-error-soft">{m.preview_failed({}, { locale })}</div>
			<button type="button" class="action-btn" onclick={() => (failed = false)}>{m.common_retry({}, { locale })}</button>
		</div>
	{:else if empty}
		<div class="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
			<div class="text-[13px] text-text-secondary">{m.score_empty({}, { locale })}</div>
			<div class="text-[12px] text-text-tertiary">{m.score_empty_hint({}, { locale })}</div>
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
