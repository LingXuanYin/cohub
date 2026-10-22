<script lang="ts">
import type { MountedEditor, SongProject } from "@neta-art/score-editor";
import { FileMusic, X } from "lucide-svelte";
import { untrack } from "svelte";
import { dismissOnBack } from "$lib/back-layers.svelte";
import CenteredLoading from "$lib/components/CenteredLoading.svelte";
import { getLocale } from "$lib/i18n/locale.svelte";
import { isComposingKeyboardEvent } from "$lib/keyboard";
import { m } from "$lib/paraglide/messages.js";
import { scoreDialects } from "$lib/score-editor/dialects";
import { scoreEditorLanguage } from "$lib/score-editor/language";
import { scoreEditorLayer } from "$lib/score-editor/layer.svelte";
import { taskRunToSongProject } from "$lib/score-editor/song-project";
import { sdk } from "$lib/sdk";

type Status = "loading" | "ready" | "unavailable" | "failed";
type Notice = { message: string; level: "info" | "warning" | "error" };

const NOTICE_MS = 6000;
const FOCUSABLE =
	'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable="true"]';

const locale = $derived(getLocale());
const language = $derived(scoreEditorLanguage(locale));
const taskRunId = $derived(scoreEditorLayer.taskRunId);
const editable = $derived(scoreEditorLayer.editable);

let rootEl = $state<HTMLDivElement | null>(null);
let hostEl = $state<HTMLDivElement | null>(null);
let status = $state<Status>("loading");
let project = $state.raw<SongProject | null>(null);
let attempt = $state(0);
let editor = $state.raw<MountedEditor | null>(null);
let notice = $state<Notice | null>(null);
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

/** One line for the header: the style description the song was made from. */
const title = $derived(project?.style.replace(/\s+/g, " ").trim() ?? "");

function showNotice(next: Notice) {
	notice = next;
	if (noticeTimer) clearTimeout(noticeTimer);
	noticeTimer = setTimeout(() => {
		notice = null;
	}, NOTICE_MS);
}

// The task is fetched by id whichever entry opened the layer.
$effect(() => {
	const id = taskRunId;
	void attempt;
	status = "loading";
	project = null;
	notice = null;
	if (!id) return;
	let current = true;
	sdk.tasks
		.get(id)
		.then(({ run }) => {
			if (!current) return;
			const next = taskRunToSongProject(run);
			if (!next || !scoreDialects.find(next.modelId)) {
				status = "unavailable";
				return;
			}
			project = next;
			status = "ready";
		})
		.catch(() => {
			if (current) status = "failed";
		});
	return () => {
		current = false;
	};
});

// The editor package is loaded on first use, so the app's first screen does not carry it.
$effect(() => {
	const target = hostEl;
	const song = project;
	if (!target || !song || status !== "ready") return;
	let current = true;
	let mounted: MountedEditor | null = null;
	void import("@neta-art/score-editor")
		.then(({ mount }) => {
			if (!current) return;
			mounted = mount(target, {
				language: untrack(() => language),
				editable: untrack(() => editable),
				notify: (next) =>
					showNotice({ message: next.message, level: next.level }),
				project: song,
				dialects: scoreDialects,
			});
			editor = mounted;
		})
		.catch(() => {
			if (current) status = "failed";
		});
	return () => {
		current = false;
		mounted?.destroy();
		editor = null;
	};
});

$effect(() => {
	editor?.update({ language, editable });
});

$effect(() => {
	if (!scoreEditorLayer.open) return;
	const original = document.body.style.overflow;
	document.body.style.overflow = "hidden";
	return () => {
		document.body.style.overflow = original;
	};
});

dismissOnBack(
	() => scoreEditorLayer.open,
	() => scoreEditorLayer.close(),
);

// Take focus on open and hand it back to the entry that opened the layer.
$effect(() => {
	const root = rootEl;
	if (!root) return;
	const previous =
		scoreEditorLayer.opener ??
		(document.activeElement instanceof HTMLElement
			? document.activeElement
			: null);
	root.focus({ preventScroll: true });
	return () => {
		if (previous?.isConnected) previous.focus({ preventScroll: true });
	};
});

function focusables(root: HTMLElement) {
	return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
		(element) =>
			!element.hasAttribute("disabled") &&
			!element.closest("[inert]") &&
			element.getClientRects().length > 0 &&
			getComputedStyle(element).visibility !== "hidden",
	);
}

function onKeydown(event: KeyboardEvent) {
	const root = rootEl;
	if (!root || isComposingKeyboardEvent(event)) return;
	if (event.key === "Escape") {
		// An open editor menu takes the key first, as the platform closes it.
		if (root.querySelector(":popover-open")) return;
		event.preventDefault();
		event.stopPropagation();
		scoreEditorLayer.close();
		return;
	}
	if (event.key !== "Tab") return;
	const items = focusables(root);
	const first = items.at(0);
	const last = items.at(-1);
	if (!first || !last) {
		event.preventDefault();
		root.focus({ preventScroll: true });
		return;
	}
	const active = document.activeElement;
	if (event.shiftKey && (active === first || active === root)) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && active === last) {
		event.preventDefault();
		first.focus();
	} else if (!root.contains(active) || active === root) {
		event.preventDefault();
		(event.shiftKey ? last : first).focus();
	}
}

// Focus never rests outside the layer while it is open.
$effect(() => {
	const root = rootEl;
	if (!root) return;
	function onFocusIn(event: FocusEvent) {
		const target = event.target;
		if (!root || (target instanceof Node && root.contains(target))) return;
		(focusables(root).at(0) ?? root).focus({ preventScroll: true });
	}
	document.addEventListener("focusin", onFocusIn);
	return () => document.removeEventListener("focusin", onFocusIn);
});
</script>

{#if scoreEditorLayer.open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions: Keys are handled on the dialog so Escape and Tab stay inside it. -->
	<div
		bind:this={rootEl}
		class="score-layer fixed inset-0 z-[var(--z-lightbox)] flex flex-col bg-bg-primary text-text-primary outline-none"
		role="dialog"
		aria-modal="true"
		aria-label={m.score_editor_title({}, { locale })}
		tabindex="-1"
		data-drawer-swipe-ignore
		onkeydown={onKeydown}
	>
		<header class="flex h-[calc(3rem+env(safe-area-inset-top))] shrink-0 items-center gap-3 border-b border-border-subtle px-3 pt-[env(safe-area-inset-top)] sm:px-4">
			<FileMusic class="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
			<div class="min-w-0 flex-1">
				<h2 class="truncate text-[14px] font-medium leading-5 text-text-primary" title={title || undefined}>
					{title || m.score_editor_title({}, { locale })}
				</h2>
				{#if project}
					<p class="truncate font-mono text-[11px] leading-4 text-text-tertiary">{project.modelId}</p>
				{/if}
			</div>
			<button type="button" class="close" onclick={() => scoreEditorLayer.close()} title={m.common_close({}, { locale })} aria-label={m.common_close({}, { locale })}>
				<X class="h-[18px] w-[18px]" />
			</button>
		</header>

		<div class="relative min-h-0 flex-1">
			{#if status === "ready"}
				<div bind:this={hostEl} class="score-host absolute inset-0"></div>
			{:else if status === "loading"}
				<CenteredLoading label={m.score_editor_loading({}, { locale })} size="panel" />
			{:else}
				<div class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
					<p class="text-[13px] leading-5 text-text-secondary">
						{status === "failed" ? m.score_editor_load_failed({}, { locale }) : m.score_editor_unavailable({}, { locale })}
					</p>
					{#if status === "failed"}
						<button type="button" class="secondary-key retry" onclick={() => (attempt += 1)}>{m.common_retry({}, { locale })}</button>
					{/if}
				</div>
			{/if}
		</div>

		{#if notice}
			<div class="toast-surface notice" class:is-error={notice.level === "error"} role="status">{notice.message}</div>
		{/if}
	</div>
{/if}

<style>
	.score-layer {
		overscroll-behavior: contain;
	}

	/* The editor's public theme variables, mapped onto the app's semantic tokens at the one place it mounts. */
	.score-host {
		--sce-color-bg: var(--bg-content);
		--sce-color-text: var(--text-primary);
		--sce-color-surface: var(--bg-surface);
		--sce-color-muted: var(--text-tertiary);
		--sce-color-line: var(--border-subtle);
		--sce-color-line-strong: var(--border-default);
		--sce-color-accent: var(--brand);
		--sce-color-note: var(--brand);
		--sce-font-family: var(--font-sans);
		--sce-radius: 6px;
	}

	.close {
		display: inline-flex;
		height: 36px;
		width: 36px;
		flex: none;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		color: var(--text-tertiary);
		transition: background-color 120ms ease, color 120ms ease;
	}

	.close:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.close:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: 2px;
	}

	.retry {
		min-height: 36px;
		padding: 0 14px;
		font-size: 12px;
	}

	.notice {
		position: absolute;
		bottom: max(16px, env(safe-area-inset-bottom));
		left: 50%;
		max-width: min(420px, calc(100% - 32px));
		transform: translateX(-50%);
		padding: 8px 12px;
		font-size: 13px;
		line-height: 20px;
		pointer-events: none;
	}

	.notice.is-error {
		color: var(--color-error-soft);
	}

	@media (pointer: coarse) {
		.close {
			height: 44px;
			width: 44px;
		}

		.retry {
			min-height: 44px;
		}
	}
</style>
