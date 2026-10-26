<script lang="ts">
import type {
	AppDetailResponse,
	AppRuntimeShellContext,
} from "@neta-art/cohub";
import type { BoardItemViewContext } from "@neta-art/cohub/board/stage";
import type { AppNavigationHandler, BoardAppMeta } from "$lib/board/board-app";
import AppSurface from "$lib/components/app/AppSurface.svelte";
import CenteredLoading from "$lib/components/CenteredLoading.svelte";

const {
	meta,
	context,
	loadDetail,
	shell,
	onNavigationOpen,
}: {
	meta: BoardAppMeta;
	context: BoardItemViewContext;
	loadDetail: (appId: string) => Promise<AppDetailResponse | null>;
	shell?: AppRuntimeShellContext;
	onNavigationOpen?: AppNavigationHandler;
} = $props();

let detail = $state<AppDetailResponse | null>(null);
let detailAppId = $state<string | null>(null);
let loading = $state(true);

$effect(() => {
	const appId = meta.appId;
	if (!context.detailed || detailAppId === appId) return;
	let current = true;
	loading = true;
	void loadDetail(appId).then((value) => {
		if (!current) return;
		detail = value;
		detailAppId = appId;
		loading = false;
	});
	return () => {
		current = false;
	};
});
</script>

<div
	class="board-app-node"
	class:selected={context.selected}
	class:entered={context.entered}
>
	<div class="board-app-bar">
		{#if meta.icon}<img src={meta.icon} alt="" />{/if}
		<span>{meta.name}</span>
	</div>
	{#if context.detailed}
		<div class="board-app-content">
			{#if detail && detailAppId === meta.appId}
				<AppSurface
					mode="app"
					app={detail.app}
					space={detail.space}
					owner={detail.owner}
					content={detail.content}
					{shell}
					{onNavigationOpen}
				/>
			{:else if loading}
				<CenteredLoading label="Loading App" size="panel" />
			{:else}
				<div class="board-app-error">App unavailable</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.board-app-node {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
		border: 1px solid var(--border-subtle);
		border-radius: 8px;
		background: var(--bg-primary);
		box-shadow: 0 8px 24px color-mix(in srgb, var(--text-primary) 12%, transparent);
		transition: border-color 120ms ease, box-shadow 120ms ease;
	}
	.board-app-node.selected {
		border-color: var(--brand-border);
	}
	.board-app-node.entered {
		border-color: var(--brand-border);
		box-shadow: 0 0 0 2px var(--brand-border), 0 8px 24px color-mix(in srgb, var(--text-primary) 12%, transparent);
	}
	.board-app-node .board-app-content {
		pointer-events: none;
	}
	.board-app-node.entered .board-app-content {
		pointer-events: auto;
	}
	.board-app-bar {
		display: flex;
		height: 28px;
		align-items: center;
		gap: 6px;
		padding: 0 8px;
		background: var(--bg-elevated);
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
	}
	.board-app-bar img {
		width: 16px;
		height: 16px;
		border-radius: 4px;
		object-fit: cover;
	}
	.board-app-bar span {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.board-app-content {
		height: calc(100% - 44px);
		min-height: 0;
		margin: 8px;
		border-radius: 4px;
		overflow: hidden;
	}
	.board-app-error {
		display: grid;
		height: 100%;
		place-items: center;
		color: var(--text-tertiary);
		font-size: 12px;
	}
</style>
