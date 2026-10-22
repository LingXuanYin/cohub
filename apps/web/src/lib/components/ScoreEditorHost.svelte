<script lang="ts">
import type {
	MountedEditor,
	Notice,
	SongProject,
} from "@neta-art/score-editor";
import { untrack } from "svelte";
import CenteredLoading from "$lib/components/CenteredLoading.svelte";
import ScoreStateMessage from "$lib/components/ScoreStateMessage.svelte";
import { getLocale } from "$lib/i18n/locale.svelte";
import { m } from "$lib/paraglide/messages.js";
import { loadScoreEditor } from "$lib/score-editor/dialects";
import { scoreEditorLanguage } from "$lib/score-editor/language";

/**
 * The one place the score editor is mounted: the full-screen layer and the file panel both render
 * this. It loads the editor and its dialects on first use, mounts them into its own element,
 * and keeps the editor's language, editability and song in step with its props. Until `ready` it
 * shows that it is loading, and if the editor's code cannot be loaded it says so, with Retry.
 */
let {
	project,
	editable,
	onNotice,
	ready = $bindable(false),
	class: className = "",
}: {
	project: SongProject;
	editable: boolean;
	onNotice?: (notice: Notice) => void;
	/** The editor is mounted and showing the song. */
	ready?: boolean;
	class?: string;
} = $props();

const locale = $derived(getLocale());
const language = $derived(scoreEditorLanguage(locale));

let hostEl = $state<HTMLDivElement | null>(null);
/** The editor's code could not be loaded or mounted. */
let failed = $state(false);
let attempt = $state(0);
let editor = $state.raw<MountedEditor | null>(null);
/** The song the editor is showing, so a prop that did not change is not applied again. */
let shownProject: SongProject | null = null;

$effect(() => {
	void attempt;
	const target = hostEl;
	if (!target) return;
	failed = false;
	let current = true;
	let mounted: MountedEditor | null = null;
	loadScoreEditor()
		.then(({ mount, dialects }) => {
			if (!current) return;
			shownProject = untrack(() => project);
			mounted = mount(target, {
				language: untrack(() => language),
				editable: untrack(() => editable),
				notify: (next) => onNotice?.(next),
				project: shownProject,
				dialects,
			});
			editor = mounted;
			ready = true;
		})
		.catch(() => {
			if (current) failed = true;
		});
	return () => {
		current = false;
		mounted?.destroy();
		editor = null;
		ready = false;
	};
});

$effect(() => {
	editor?.update({ language, editable });
});

$effect(() => {
	const next = project;
	if (!editor || next === shownProject) return;
	shownProject = next;
	editor.update({ project: next });
});
</script>

<div class={className}>
	<div bind:this={hostEl} class="score-host"></div>
	{#if failed}
		<ScoreStateMessage message={m.score_editor_failed({}, { locale })} onRetry={() => (attempt += 1)} class="absolute inset-0" />
	{:else if !ready}
		<CenteredLoading label={m.score_editor_loading({}, { locale })} size="panel" class="absolute inset-0" />
	{/if}
</div>

<style>
	/* The editor's public theme variables, mapped onto the app's semantic tokens at the one place it mounts. */
	.score-host {
		position: absolute;
		inset: 0;
		--sce-color-bg: var(--bg-content);
		--sce-color-text: var(--text-primary);
		--sce-color-surface: var(--bg-surface);
		--sce-color-muted: var(--text-secondary);
		--sce-color-line: var(--border-subtle);
		--sce-color-line-strong: var(--border-default);
		--sce-color-accent: var(--brand);
		--sce-color-note: var(--brand);
		--sce-font-family: var(--font-sans);
		--sce-radius: 6px;
	}
</style>
