<script lang="ts">
import type { Notice, SongProject } from "@neta-art/score-editor";
import { FileMusic, X } from "lucide-svelte";
import { dismissOnBack } from "$lib/back-layers.svelte";
import CenteredLoading from "$lib/components/CenteredLoading.svelte";
import ScoreEditorHost from "$lib/components/ScoreEditorHost.svelte";
import ScoreStateMessage from "$lib/components/ScoreStateMessage.svelte";
import { getLocale } from "$lib/i18n/locale.svelte";
import { isComposingKeyboardEvent } from "$lib/keyboard";
import { m } from "$lib/paraglide/messages.js";
import { loadScoreEditor, scoreModelIds } from "$lib/score-editor/dialects";
import { scoreEditorLayer } from "$lib/score-editor/layer.svelte";
import { taskRunToSongProject } from "$lib/score-editor/song-project";
import { sdk } from "$lib/sdk";

type Status = "loading" | "ready" | "unavailable" | "failed";

const NOTICE_MS = 6000;
const FOCUSABLE =
	'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable="true"]';

const locale = $derived(getLocale());
const taskRunId = $derived(scoreEditorLayer.taskRunId);
const editable = $derived(scoreEditorLayer.editable);

let rootEl = $state<HTMLDivElement | null>(null);
let status = $state<Status>("loading");
let project = $state.raw<SongProject | null>(null);
let attempt = $state(0);
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

// The task is fetched by id whichever entry opened the layer; the editor itself loads meanwhile.
$effect(() => {
	const id = taskRunId;
	void attempt;
	status = "loading";
	project = null;
	notice = null;
	if (!id) return;
	loadScoreEditor().catch(() => undefined);
	let current = true;
	sdk.tasks
		.get(id)
		.then(({ run }) => {
			if (!current) return;
			const next = taskRunToSongProject(run);
			if (!next || !scoreModelIds.has(next.modelId)) {
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
	// The editor has handled the key by now; the workspace's own key shortcuts must not act behind the layer.
	event.stopPropagation();
	if (event.key === "Escape") {
		// An open editor menu takes the key first, as the platform closes it.
		if (root.querySelector(":popover-open")) return;
		event.preventDefault();
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
		aria-describedby="score-layer-title"
		tabindex="-1"
		data-drawer-swipe-ignore
		onkeydown={onKeydown}
	>
		<header class="score-header flex shrink-0 items-center gap-3 border-b border-border-subtle px-3 sm:px-4">
			<FileMusic class="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
			<div class="min-w-0 flex-1">
				<h2 id="score-layer-title" class="truncate text-[14px] font-medium leading-5 text-text-primary" title={title || undefined}>
					{title || m.score_editor_title({}, { locale })}
				</h2>
				{#if project}
					<p class="model-id truncate font-mono text-[11px] leading-4 text-text-secondary">{project.modelId}</p>
				{/if}
			</div>
			<button type="button" class="close" onclick={() => scoreEditorLayer.close()} title={m.common_close({}, { locale })} aria-label={m.common_close({}, { locale })}>
				<X class="h-[18px] w-[18px]" />
			</button>
		</header>

		<div class="relative min-h-0 flex-1">
			{#if status === "ready" && project}
				<ScoreEditorHost {project} {editable} onNotice={showNotice} class="absolute inset-0" />
			{:else if status === "loading"}
				<CenteredLoading label={m.score_editor_loading({}, { locale })} size="panel" class="h-full" />
			{:else if status === "failed"}
				<ScoreStateMessage message={m.score_editor_load_failed({}, { locale })} onRetry={() => (attempt += 1)} />
			{:else}
				<ScoreStateMessage message={m.score_editor_unavailable({}, { locale })} />
			{/if}
		</div>

		{#if notice}
			<div class="toast-surface notice" class:is-error={notice.level === "error"} role={notice.level === "error" ? "alert" : "status"}>{notice.message}</div>
		{/if}
	</div>
{/if}

<style>
	.score-layer {
		overscroll-behavior: contain;
		/* A phone held sideways can have its notch beside the layer. */
		padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
	}

	.score-header {
		height: calc(3rem + env(safe-area-inset-top));
		padding-top: env(safe-area-inset-top);
	}

	.close {
		display: inline-flex;
		height: 36px;
		width: 36px;
		flex: none;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		color: var(--text-secondary);
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

	/* A phone held sideways: the editor needs the height more than the model id does. */
	@media (pointer: coarse) and (max-height: 480px) {
		.score-header {
			height: calc(2.5rem + env(safe-area-inset-top));
		}

		.model-id {
			display: none;
		}
	}

	@media (pointer: coarse) {
		.close {
			height: 44px;
			width: 44px;
		}	}
</style>
