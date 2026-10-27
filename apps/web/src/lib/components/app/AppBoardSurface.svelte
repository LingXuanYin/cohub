<script lang="ts">
import type { AppRuntimeShellContext, WorkContent } from "@neta-art/cohub";
import type { BoardLaunch, PublishedBoard } from "@neta-art/cohub/board";
import type { BoardStage } from "@neta-art/cohub/board/stage";
import { Info } from "lucide-svelte";
import type { AppNavigationHandler } from "$lib/board/board-app";
import { loadPublishedBoard } from "$lib/board/published-board";
import {
	type BoardScope,
	cohubPixiRuntime,
} from "$lib/board/runtime/board-runtime";
import CenteredLoading from "$lib/components/CenteredLoading.svelte";
import { getLocale } from "$lib/i18n/locale.svelte";
import { m } from "$lib/paraglide/messages.js";

const {
	content,
	appId,
	isMobile = false,
	launch = null,
	shareUrl,
	shell,
	onNavigationOpen,
	onReady,
}: {
	content: Extract<WorkContent, { kind: "board" }>;
	appId: string;
	isMobile?: boolean;
	launch?: BoardLaunch | null;
	shareUrl?: () => string;
	shell?: AppRuntimeShellContext;
	onNavigationOpen?: AppNavigationHandler;
	onReady?: () => void;
} = $props();

const locale = $derived(getLocale());
const runtime = cohubPixiRuntime.load();
runtime.catch(() => onReady?.());

let loaded = $state.raw<{ url: string; board: PublishedBoard } | null>(null);
let failed = $state(false);

const board = $derived(loaded?.url === content.url ? loaded.board : null);
const scope = $derived<BoardScope | null>(
	board ? { kind: "app", appId, assetSource: board.assetSource } : null,
);

$effect(() => {
	const url = content.url;
	let cancelled = false;
	failed = false;
	loadPublishedBoard(url).then(
		(value) => {
			if (!cancelled) loaded = { url, board: value };
		},
		() => {
			if (cancelled) return;
			failed = true;
			onReady?.();
		},
	);
	return () => {
		cancelled = true;
	};
});

function handleStage(stage: BoardStage | null) {
	void stage?.ready.then(() =>
		requestAnimationFrame(() => requestAnimationFrame(() => onReady?.())),
	);
}
</script>

<div class="work-board-surface">
	{#if failed}
		<div class="board-message error" role="alert">{m.board_failed_load({}, { locale })}</div>
	{:else if !board || !scope}
		<CenteredLoading label={m.common_loading({}, { locale })} size="page" />
	{:else}
		{#await runtime}
			<CenteredLoading label={m.common_loading({}, { locale })} size="page" />
		{:then module}
			{@const BoardRuntime = module.default}
			{#key content.url}
				{#if board.externalUrls.length}
					<details class="absolute right-3 top-3 z-10 text-text-tertiary">
						<summary class="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded bg-bg-primary" aria-label={m.board_external_media({}, { locale })} title={m.board_external_media({}, { locale })}><Info class="h-4 w-4" /></summary>
						<p class="absolute right-0 mt-1 w-60 rounded border border-border-primary bg-bg-primary p-3 text-xs text-text-secondary shadow-lg">{m.board_external_media({}, { locale })}</p>
					</details>
				{/if}
				<BoardRuntime
					mode="view"
					path={content.path}
					boardId={content.boardId}
					document={board.document}
					playback={null}
					{scope}
					{launch}
					{shareUrl}
					{shell}
					{onNavigationOpen}
					{isMobile}
					onStageReady={handleStage}
				/>
			{/key}
		{:catch}
			<div class="board-message error" role="alert">{m.board_failed_load({}, { locale })}</div>
		{/await}
	{/if}
</div>

<style>
	.work-board-surface {
		position: relative;
		height: 100%;
		min-height: 0;
		background: var(--bg-primary);
	}

	.board-message {
		display: flex;
		height: 100%;
		min-height: 240px;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		font-size: 0.8125rem;
	}

	.board-message.error {
		color: var(--color-error-soft);
	}
</style>
