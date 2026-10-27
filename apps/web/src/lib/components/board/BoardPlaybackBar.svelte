<script lang="ts">
import type {
	BoardPlaybackCommand,
	BoardPlaybackSnapshot,
} from "@cohub/protocol";
import { ListOrdered, Pause, Play, SkipForward, X } from "lucide-svelte";
import { untrack } from "svelte";
import { formatBoardTime } from "$lib/board/animation-timeline";
import { createBoardAnimationTransport } from "$lib/board/board-animation-transport.svelte";
import type { BoardEditor } from "$lib/board/editor.svelte";
import BoardMenu, {
	type BoardMenuItem,
} from "$lib/components/board/BoardMenu.svelte";
import { getLocale } from "$lib/i18n/locale.svelte";
import { m } from "$lib/paraglide/messages.js";

const {
	editor,
	playback,
	onPlayback,
	onClose,
}: {
	editor: BoardEditor;
	playback: BoardPlaybackSnapshot | null;
	onPlayback: (command: BoardPlaybackCommand) => unknown;
	onClose: () => void;
} = $props();

const locale = $derived(getLocale());
const transport = createBoardAnimationTransport({
	editor: untrack(() => editor),
	playback: () => playback,
	send: (command) => onPlayback(command),
	hold: false,
});
const animation = $derived(transport.animation);
const duration = $derived(Math.max(1, animation?.duration ?? 1));
const chapters = $derived(
	animation?.markers.filter((marker) => marker.label) ?? [],
);

let listAnchor = $state<HTMLButtonElement | null>(null);
let listOpen = $state(false);
const items = $derived<BoardMenuItem[]>([
	...transport.ids.map((id) => ({
		id: `animation-${id}`,
		label: editor.animations[id]?.name || id,
		checked: id === transport.animationId,
		run: () => transport.choose(id),
	})),
	...(chapters.length && transport.ids.length > 1
		? [{ id: "separator", separator: true as const }]
		: []),
	...chapters.map((marker, index) => ({
		id: `chapter-${index}`,
		label: marker.label ?? formatBoardTime(marker.at),
		run: () => transport.seek(marker.at),
	})),
]);
</script>

{#if animation}
	<div class="playback toolbar-surface" role="toolbar" aria-label={m.board_play_animation({}, { locale })}>
		<button
			type="button"
			class="tool-key"
			title={transport.playing ? m.board_pause({}, { locale }) : m.board_play({}, { locale })}
			aria-label={transport.playing ? m.board_pause({}, { locale }) : m.board_play({}, { locale })}
			onclick={transport.toggle}
		>
			{#if transport.playing}<Pause class="h-3.5 w-3.5" fill="currentColor" />{:else}<Play class="h-3.5 w-3.5" fill="currentColor" />{/if}
		</button>
		{#if items.length > 1}
			<button
				bind:this={listAnchor}
				type="button"
				class="tool-key name"
				aria-haspopup="menu"
				aria-expanded={listOpen}
				onclick={() => { listOpen = !listOpen; }}
			>
				<ListOrdered class="h-3.5 w-3.5 shrink-0" />
				<span>{animation.name || transport.animationId}</span>
			</button>
		{/if}
		<input
			class="scrub"
			type="range"
			min="0"
			max={duration}
			step="10"
			value={transport.time}
			aria-label={m.board_playhead({}, { locale })}
			aria-valuetext={formatBoardTime(transport.time)}
			oninput={(event) => transport.seek(Number(event.currentTarget.value))}
		/>
		<span class="time">{formatBoardTime(transport.time)}</span>
		{#if transport.nextMarker}
			<button type="button" class="tool-key" title={m.board_next_marker({}, { locale })} aria-label={m.board_next_marker({}, { locale })} onclick={transport.next}>
				<SkipForward class="h-3.5 w-3.5" />
			</button>
		{/if}
		<button type="button" class="tool-key" title={m.board_close({}, { locale })} aria-label={m.board_close({}, { locale })} onclick={onClose}>
			<X class="h-3.5 w-3.5" />
		</button>
	</div>
	{#if listOpen && listAnchor}
		<BoardMenu anchor={listAnchor} {items} label={m.board_animation_select({}, { locale })} onClose={() => { listOpen = false; }} />
	{/if}
{/if}

<style>
	.playback {
		position: absolute;
		bottom: 14px;
		left: 50%;
		z-index: 26;
		width: min(520px, calc(100% - 200px));
		translate: -50% 0;
	}
	.name {
		max-width: 160px;
		padding: 0 8px;
		font-size: 12px;
	}
	.name span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.scrub {
		flex: 1;
		min-width: 60px;
		accent-color: var(--brand);
	}
	.time {
		flex: none;
		min-width: 44px;
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	@media (pointer: coarse) {
		.playback {
			--tool-key-size: 38px;
			bottom: calc(64px + env(safe-area-inset-bottom, 0px));
			width: calc(100% - 16px);
		}
	}
</style>
