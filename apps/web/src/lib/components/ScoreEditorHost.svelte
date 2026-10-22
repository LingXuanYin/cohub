<script lang="ts">
import type {
	MountedEditor,
	Notice,
	SongProject,
} from "@neta-art/score-editor";
import { untrack } from "svelte";
import { getLocale } from "$lib/i18n/locale.svelte";
import { loadScoreEditor } from "$lib/score-editor/dialects";
import { scoreEditorLanguage } from "$lib/score-editor/language";

/**
 * The one place the score editor is mounted: the full-screen layer and the file panel both render
 * this. It loads the editor and its dialects on first use, mounts them into its own element,
 * and keeps the editor's language, editability and song in step with its props. The element is
 * empty until `ready`, so the caller decides what to show meanwhile and when loading fails.
 */
let {
	project,
	editable,
	onNotice,
	onFailed,
	ready = $bindable(false),
	class: className = "",
}: {
	project: SongProject;
	editable: boolean;
	onNotice?: (notice: Notice) => void;
	/** The editor's code could not be loaded or mounted. */
	onFailed?: () => void;
	ready?: boolean;
	class?: string;
} = $props();

const language = $derived(scoreEditorLanguage(getLocale()));

let hostEl = $state<HTMLDivElement | null>(null);
let editor = $state.raw<MountedEditor | null>(null);
/** The song the editor is showing, so a prop that did not change is not applied again. */
let shownProject: SongProject | null = null;

$effect(() => {
	const target = hostEl;
	if (!target) return;
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
			if (current) onFailed?.();
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

<div bind:this={hostEl} class="score-host {className}"></div>

<style>
	/* The editor's public theme variables, mapped onto the app's semantic tokens at the one place it mounts. */
	.score-host {
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
