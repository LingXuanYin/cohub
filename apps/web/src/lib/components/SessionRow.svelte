<script lang="ts">
import type { SessionRecord } from "@neta-art/cohub";
import { Check, Link2Off, Pencil, TextCursorInput, X } from "lucide-svelte";
import type { Snippet } from "svelte";
import { clock } from "$lib/clock.svelte";
import ListRow from "$lib/components/list-page/ListRow.svelte";
import ListRowText from "$lib/components/list-page/ListRowText.svelte";
import type { ListRowDensity } from "$lib/components/list-page/list-row";
import StatusGlyph, {
	type StatusGlyphMotion,
	type StatusGlyphShape,
	type StatusGlyphTone,
} from "$lib/components/StatusGlyph.svelte";
import SidebarActionButton from "$lib/components/sidebar/SidebarActionButton.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import { formatElapsedMs } from "$lib/format-duration";
import { getLocale } from "$lib/i18n/locale.svelte";
import { m } from "$lib/paraglide/messages.js";
import {
	getSessionRowStatus,
	getSessionStoppedLabel,
	type SessionRowStatusKind,
} from "$lib/session-activity";
import type { SessionRowTree } from "$lib/session-fork-tree";
import { getSessionPreview, getSessionPreviewText } from "$lib/session-preview";
import { getSessionActivityAt } from "$lib/session-sort";
import { authStore } from "$lib/stores/auth.svelte";
import {
	chatsSourceName,
	resolveSessionSourceKey,
} from "$lib/stores/chats-filter";
import { unreadTracker } from "$lib/stores/session-state.svelte";
import { formatCompactAbsoluteTime } from "$lib/time-format";

const {
	session,
	title,
	href,
	density,
	active = false,
	isMobile = false,
	showSourceBadge = false,
	avatar,
	tree,
	tooltip,
	draggable = false,
	showInsert = true,
	showRename = true,
	renaming = false,
	renameValue = "",
	renameSaving = false,
	removeLabelTitle,
	removeLabelDisabled = false,
	onNavigate,
	onDoubleClick,
	onInsert,
	onRename,
	onRenameValueChange,
	onSubmitRename,
	onCancelRename,
	onRemoveLabel,
	onDragStart,
	onDragEnd,
}: {
	session: SessionRecord;
	title: string;
	href: string;
	density: ListRowDensity;
	active?: boolean;
	isMobile?: boolean;
	showSourceBadge?: boolean;
	avatar?: Snippet;
	tree?: SessionRowTree | null;
	tooltip?: string;
	draggable?: boolean;
	showInsert?: boolean;
	showRename?: boolean;
	renaming?: boolean;
	renameValue?: string;
	renameSaving?: boolean;
	removeLabelTitle?: string;
	removeLabelDisabled?: boolean;
	onNavigate: (event: MouseEvent, session: SessionRecord) => void;
	onDoubleClick?: (event: MouseEvent, session: SessionRecord) => void;
	onInsert?: (path: string) => void;
	onRename?: (session: SessionRecord) => void;
	onRenameValueChange?: (value: string) => void;
	onSubmitRename?: (session: SessionRecord) => void;
	onCancelRename?: () => void;
	onRemoveLabel?: () => void;
	onDragStart?: (
		event: DragEvent,
		session: SessionRecord,
		title: string,
	) => void;
	onDragEnd?: () => void;
} = $props();

type Participant = {
	key: string;
	name: string;
	avatarUrl: string | null;
};

type Glyph = {
	shape: StatusGlyphShape;
	tone: StatusGlyphTone;
	motion?: StatusGlyphMotion;
	soft?: boolean;
};

const GLYPHS: Record<
	Exclude<SessionRowStatusKind, "idle" | "unread">,
	Glyph
> = {
	running: { shape: "dots", tone: "activity", motion: "active" },
	queued: { shape: "dots", tone: "muted", soft: true },
	stopping: { shape: "dots", tone: "muted", motion: "slow" },
	failed: { shape: "ring", tone: "error" },
	lost: { shape: "ring", tone: "warning", soft: true },
};

const locale = $derived(getLocale());
let renameInput = $state<HTMLInputElement | null>(null);

const dense = $derived(density === "dense");
const isUnread = $derived(
	unreadTracker.isUnread(session, session.lastMessageId),
);
const status = $derived(getSessionRowStatus(session, isUnread, locale));
const glyph = $derived(
	status.kind === "idle" || status.kind === "unread"
		? null
		: GLYPHS[status.kind],
);
const startedAtMs = $derived(
	status.startedAt ? Date.parse(status.startedAt) : Number.NaN,
);
const statusText = $derived(
	Number.isFinite(startedAtMs)
		? m.session_activity_running_for(
				{ duration: formatElapsedMs(clock.now - startedAtMs, locale) },
				{ locale },
			)
		: status.label,
);
const time = $derived(formatCompactAbsoluteTime(getSessionActivityAt(session)));
const sourceKey = $derived(resolveSessionSourceKey(session.source));
const sourceName = $derived(chatsSourceName(sourceKey, locale));
const participants = $derived(
	visibleParticipants(sessionParticipants(session), authStore.userUuid),
);
const participantLabel = $derived(
	participants.length > 3
		? `${participants
				.slice(0, 3)
				.map((participant) => participant.name)
				.join(", ")} +${participants.length - 3}`
		: participants.map((participant) => participant.name).join(", "),
);
const hasMessages = $derived(
	Boolean(session.latestMessageText || session.lastMessageAt),
);
// Web chats keep a preview that repeats the title; others fall back to the source.
const preview = $derived(
	dense
		? null
		: sourceKey === "web"
			? getSessionPreviewText(session)
			: getSessionPreview(session, title),
);
const detail = $derived(status.errorMessage ?? preview);
const showStatus = $derived(glyph !== null || status.kind === "unread");
const stoppedLabel = $derived(
	dense ? null : getSessionStoppedLabel(session, locale),
);
const showSourceLine = $derived(
	!dense && !stoppedLabel && !preview && hasMessages && sourceKey !== "web",
);
const sourceBadge = $derived(
	showSourceBadge && !showSourceLine && sourceKey !== "web" ? sourceName : "",
);

const isFork = $derived(Boolean(tree && tree.depth > 0));
const guide = $derived(
	tree && (isFork || tree.hasChildren) ? (avatar ? "column" : "indent") : null,
);

const actionCount = $derived(
	isMobile
		? 0
		: (showInsert && onInsert ? 1 : 0) +
				(showRename && onRename ? 1 : 0) +
				(onRemoveLabel ? 1 : 0),
);
const HOVER_ROOM = [
	"",
	"hover:pr-8 focus-within:pr-8",
	"hover:pr-12 focus-within:pr-12",
	"hover:pr-16 focus-within:pr-16",
] as const;
const hoverRoomClass = $derived(HOVER_ROOM[actionCount] ?? "");

$effect(() => {
	if (!renaming) return;
	requestAnimationFrame(() => {
		renameInput?.focus();
		renameInput?.select();
	});
});

function sessionParticipants(record: SessionRecord): Participant[] {
	const list: Participant[] = [];
	const seen = new Set<string>();
	for (const profile of [
		record.userProfile,
		...(record.participantProfiles ?? []),
	]) {
		const name = profile?.displayName?.trim();
		if (!name) continue;
		const key = profile?.userUuid?.trim() || name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		list.push({ key, name, avatarUrl: profile?.avatarUrl ?? null });
	}
	return list;
}

function visibleParticipants(list: Participant[], viewer: string | null) {
	if (!viewer || list.some((participant) => participant.key !== viewer))
		return list;
	return [];
}
</script>

{#snippet leading()}
	{#if !isFork}{@render avatar?.()}{/if}
{/snippet}

{#snippet meta()}
	<span class="inline-flex items-center gap-1.5 {actionCount ? 'group-hover/row:hidden group-focus-within/row:hidden' : ''}">
		{#if sourceBadge}
			<span class="max-w-20 truncate rounded-[3px] bg-bg-hover-strong px-1.5 py-px text-[10px] font-medium leading-none text-text-tertiary" title={sourceBadge}>{sourceBadge}</span>
		{/if}
		{#if !(dense && glyph)}{time}{/if}
		{#if dense && showStatus}{@render statusTag()}{/if}
	</span>
{/snippet}

{#snippet people()}
	<span class="inline-flex min-w-0 shrink-0 items-center gap-1.5 {dense ? 'max-w-[60%]' : 'max-w-[40%]'}" title={participantLabel}>
		<span class="inline-flex shrink-0 -space-x-1.5 opacity-80">
			{#each participants.slice(0, 3) as participant (participant.key)}
				<UserAvatar name={participant.name} avatarUrl={participant.avatarUrl} seed={participant.key} size="xxs" class="border-bg-primary {dense ? 'h-3.5 w-3.5' : ''}" />
			{/each}
		</span>
		<span class="min-w-0 truncate">{participantLabel}</span>
	</span>
{/snippet}

{#snippet secondLine()}
	{#if stoppedLabel}
		<span class="text-text-tertiary">{stoppedLabel}</span>
		{#if preview}<span title={preview}> · {preview}</span>{/if}
	{:else if detail}
		<span title={detail}>{detail}</span>
	{:else if showSourceLine}
		<span class="text-text-placeholder">{sourceName}</span>
	{:else if !hasMessages}
		<span class="text-text-placeholder">{m.chats_row_no_messages({}, { locale })}</span>
	{/if}
{/snippet}

{#snippet statusTag()}
	{#if glyph}
		<span class="session-status" data-tone={glyph.tone} title={[statusText, status.errorMessage].filter(Boolean).join(" · ")}>
			<StatusGlyph {...glyph} class="[--status-glyph-size:5px]" />
			<span class="truncate">{statusText}</span>
		</span>
	{:else}
		<StatusGlyph tone="activity" class="[--status-glyph-size:7px]" />
	{/if}
{/snippet}

{#if renaming}
	<ListRow {density} active data-session-rename leading={avatar ? leading : undefined}>
		<input
			bind:this={renameInput}
			value={renameValue}
			type="text"
			class="min-w-0 flex-1 bg-transparent text-[length:var(--list-title-size)] leading-tight text-text-primary outline-none"
			placeholder={m.sidebar_session_name({}, { locale })}
			maxlength="80"
			disabled={renameSaving}
			oninput={(event) => onRenameValueChange?.(event.currentTarget.value)}
			onkeydown={(event) => {
				if (renameSaving) return;
				if (event.key === "Enter") {
					event.preventDefault();
					onSubmitRename?.(session);
				} else if (event.key === "Escape") {
					event.preventDefault();
					onCancelRename?.();
				}
			}}
		/>
		<button
			type="button"
			class="shrink-0 rounded p-0.5 text-status-running transition-colors hover:bg-bg-hover disabled:opacity-50"
			disabled={renameSaving}
			title={m.common_save({}, { locale })}
			onclick={() => onSubmitRename?.(session)}
		>
			<Check class="h-3.5 w-3.5" />
		</button>
		<button
			type="button"
			class="shrink-0 rounded p-0.5 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
			disabled={renameSaving}
			title={m.common_cancel({}, { locale })}
			onclick={() => onCancelRename?.()}
		>
			<X class="h-3.5 w-3.5" />
		</button>
	</ListRow>
{:else}
	<ListRow
		{density}
		{href}
		{active}
		class="session-row {hoverRoomClass} {isMobile ? 'select-none [-webkit-touch-callout:none]' : ''}"
		style={guide === "indent" ? `--tree-step: ${isMobile ? 10 : 12}px` : undefined}
		data-tree={guide ?? undefined}
		data-depth={guide ? tree?.depth : undefined}
		data-last={guide && isFork && tree?.last ? "" : undefined}
		data-children={guide && tree?.hasChildren ? "" : undefined}
		data-through={guide && tree?.through ? "" : undefined}
		data-unread={!dense && status.kind === "unread" ? "" : undefined}
		aria-current={active ? "page" : undefined}
		title={tooltip}
		aria-label={[title, status.label, stoppedLabel, tooltip].filter(Boolean).join(', ')}
		draggable={!isMobile && draggable}
		leading={avatar ? leading : undefined}
		onclick={(event: MouseEvent) => onNavigate(event, session)}
		ondblclick={(event: MouseEvent) => onDoubleClick?.(event, session)}
		ondragstart={(event: DragEvent) => onDragStart?.(event, session, title)}
		ondragend={onDragEnd}
	>
		<ListRowText
			{title}
			{meta}
			lead={participants.length > 0 ? people : undefined}
			subtitle={dense ? undefined : secondLine}
			status={!dense && showStatus ? statusTag : undefined}
		/>
		{#snippet trailing()}
			{#if actionCount > 0}
				<span class="pointer-events-none absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100">
					{#if showInsert && onInsert}
						<SidebarActionButton icon={TextCursorInput} title={m.common_insert({}, { locale })} onClick={() => onInsert(`/sessions/${session.id}.jsonl`)} />
					{/if}
					{#if showRename && onRename}
						<SidebarActionButton icon={Pencil} title={m.common_rename({}, { locale })} onClick={() => onRename(session)} />
					{/if}
					{#if onRemoveLabel}
						<SidebarActionButton icon={Link2Off} title={removeLabelTitle ?? m.sidebar_remove_from_label_generic({}, { locale })} disabled={removeLabelDisabled} tone="danger" onClick={onRemoveLabel} />
					{/if}
				</span>
			{/if}
		{/snippet}
	</ListRow>
{/if}

<style>
	.session-status {
		--status-tone: var(--color-text-tertiary);
		display: inline-flex;
		max-width: 10rem;
		height: var(--list-subtitle-leading);
		align-items: center;
		gap: 5px;
		padding-inline: 6px;
		border-radius: var(--indicator-radius);
		background: color-mix(in oklab, var(--status-tone) 10%, transparent);
		color: var(--color-text-tertiary);
		font-size: var(--list-meta-size);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.session-status[data-tone="activity"] {
		--status-tone: var(--activity);
		color: var(--color-text-secondary);
	}

	.session-status[data-tone="error"] {
		--status-tone: var(--color-status-error);
		color: var(--color-error-soft);
	}

	.session-status[data-tone="warning"] {
		--status-tone: var(--color-status-starting);
		color: var(--color-warning-soft);
	}

	:global(.session-row[data-unread]) {
		--list-subtitle-color: var(--color-text-secondary);
	}

	/* Rails are borders on integer x positions so every segment snaps alike. */
	:global(.session-row[data-tree="column"]) {
		--tree-step: 16px;
		--tree-x1: calc(var(--list-row-pad-x) + var(--list-avatar-size) / 2 - 1px);
		--tree-x2: calc(
			var(--list-row-pad-x) + var(--list-avatar-size) + var(--list-row-gap) + 1px
		);
		--tree-text-x: calc(var(--tree-x2) - 1px);
		--tree-title-y: calc(
			50% - (var(--list-text-gap) + var(--list-subtitle-leading)) / 2
		);
		--tree-stem-y: calc(
			50% +
			(var(--list-title-leading) + var(--list-text-gap) + var(--list-subtitle-leading)) /
			2 + 2px
		);
		--tree-reach-gap: 4px;
		--tree-radius: 10px;
		--tree-overhang: 0px;
	}

	:global(.session-row[data-tree="column"][data-depth="0"]) {
		--tree-stem-y: calc(50% + var(--list-avatar-size) / 2 + 4px);
	}

	:global(.session-row[data-tree="column"][data-depth="2"]) {
		--tree-text-x: calc(var(--tree-x2) - 1px + var(--tree-step));
	}

	:global(.session-row[data-tree="column"][data-depth="2"] .list-row-leading) {
		width: calc(var(--list-avatar-size) + var(--tree-step));
	}

	:global(.session-row[data-tree="indent"]) {
		--tree-x1: calc(var(--list-row-pad-x) + var(--tree-step) - 7px);
		--tree-x2: calc(var(--tree-x1) + var(--tree-step));
		--tree-text-x: calc(var(--tree-x1) + 7px);
		--tree-title-y: calc(6px + var(--list-title-leading) / 2);
		--tree-stem-y: calc(100% - 4px);
		--tree-reach-gap: 3px;
		--tree-radius: 4px;
		--tree-overhang: -2px;
		overflow: visible;
	}

	:global(.session-row[data-tree="indent"][data-depth="1"]) {
		padding-left: var(--tree-text-x);
	}

	:global(.session-row[data-tree="indent"][data-depth="2"]) {
		--tree-text-x: calc(var(--tree-x2) + 7px);
		padding-left: var(--tree-text-x);
	}

	:global(.session-row[data-depth="1"]) {
		--tree-x: var(--tree-x1);
		--tree-next-x: var(--tree-x2);
	}

	:global(.session-row[data-depth="2"]) {
		--tree-x: var(--tree-x2);
	}

	:global(.session-row[data-depth="0"]) {
		--tree-next-x: var(--tree-x1);
	}

	:global(.session-row[data-tree])::before,
	:global(.session-row[data-tree])::after {
		position: absolute;
		border: 0 solid var(--list-tree-guide);
		pointer-events: none;
	}

	:global(.session-row[data-tree]:not([data-depth="0"]))::before {
		content: "";
		left: var(--tree-x);
		top: 0;
		bottom: var(--tree-overhang);
		border-left-width: var(--list-tree-width);
	}

	:global(.session-row[data-tree][data-last])::before {
		bottom: auto;
		width: calc(var(--tree-text-x) - var(--tree-x) - var(--tree-reach-gap));
		height: calc(var(--tree-title-y) + var(--list-tree-width) / 2);
		border-bottom-width: var(--list-tree-width);
		border-bottom-left-radius: var(--tree-radius);
	}

	:global(.session-row[data-tree][data-children])::after,
	:global(.session-row[data-tree][data-through])::after {
		content: "";
		left: var(--tree-next-x);
		top: var(--tree-stem-y);
		bottom: var(--tree-overhang);
		border-left-width: var(--list-tree-width);
	}

	:global(.session-row[data-tree][data-through])::after {
		left: var(--tree-x1);
		top: 0;
	}
</style>
