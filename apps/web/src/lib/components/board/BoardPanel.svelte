<script lang="ts">
import type {
	BoardPatch,
	BoardPlaybackCommand,
	BoardPlaybackSnapshot,
} from "@cohub/protocol";
import {
	type BoardMediaItemKind,
	type BoardSceneItem,
	boardItemOrigin,
	boardModelFormat,
	boardOriginKey,
	boardTaskCardSize,
	createMediaBoardItem,
	createTaskResultItems,
	inferBoardMediaKind,
	isBoardModelItem,
	normalizeBoardRemoteUrl,
	parseBoardDocument,
	parseBoardMediaSource,
	taskRunArtifacts,
	type WorldPoint,
	worldPoint,
} from "@neta-art/cohub/board";
import {
	type BoardKeyCommand,
	defaultBoardTool,
	handleBoardKeyDown,
	handleBoardKeyUp,
} from "@neta-art/cohub/board/editor";
import { nextLocalPlayback } from "@neta-art/cohub/board/player";
import {
	type BoardBackdropStatus,
	type BoardContextMenuRequest,
	type BoardStage as BoardStageController,
	boardDeviceBudget,
	createBoardAssetManager,
	readBoardDeviceSignals,
} from "@neta-art/cohub/board/stage";
import { AppWindow, ExternalLink, Play, Square } from "lucide-svelte";
import { onDestroy, onMount, untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import {
	boardAppMeta,
	boardAppOpenUrl,
	createBoardAppDetailLoader,
} from "$lib/board/board-app";
import { createBoardAppItemView } from "$lib/board/board-app-view.svelte";
import { createSpaceBoardAssetSource } from "$lib/board/board-asset-source";
import {
	type BoardAwarenessController,
	boardAwarenessViewportFromCamera,
	createBoardAwarenessController,
} from "$lib/board/board-awareness";
import {
	generationPromptFromContent,
	pendingGenerationTaskSnapshot,
	pendingTaskPosition,
	regenerationRequestFromTaskRun,
} from "$lib/board/board-generation";
import type { BoardStageExportBridge } from "$lib/board/board-image-export";
import { opensInPlace } from "$lib/board/board-media-playback";
import { createBoardModelPreviews } from "$lib/board/board-model";
import {
	type BoardViewPreference,
	boardViewPreferenceFromCamera,
	cameraFromBoardViewPreference,
	readBoardViewPreference,
	writeBoardViewPreference,
} from "$lib/board/board-view-preferences";
import { createBoardEditor } from "$lib/board/editor.svelte";
import type { BoardRuntimeProps } from "$lib/board/runtime/board-runtime";
import { canUseUserScopedCache, getCacheUserKey } from "$lib/cache/keys";
import BoardAppearancePopover from "$lib/components/board/BoardAppearancePopover.svelte";
import BoardArrowToolbar from "$lib/components/board/BoardArrowToolbar.svelte";
import BoardCollaboratorOverlay from "$lib/components/board/BoardCollaboratorOverlay.svelte";
import BoardContextMenu, {
	type BoardMenuAction,
} from "$lib/components/board/BoardContextMenu.svelte";
import BoardEmptyState from "$lib/components/board/BoardEmptyState.svelte";
import BoardExportDialog from "$lib/components/board/BoardExportDialog.svelte";
import BoardFloatingToolbar from "$lib/components/board/BoardFloatingToolbar.svelte";
import BoardGenerationComposer from "$lib/components/board/BoardGenerationComposer.svelte";
import BoardLinkPopover from "$lib/components/board/BoardLinkPopover.svelte";
import BoardMediaPlayer from "$lib/components/board/BoardMediaPlayer.svelte";
import BoardMobileChrome from "$lib/components/board/BoardMobileChrome.svelte";
import BoardModelViewer from "$lib/components/board/BoardModelViewer.svelte";
import BoardScripts from "$lib/components/board/BoardScripts.svelte";
import BoardSelectionToolbar from "$lib/components/board/BoardSelectionToolbar.svelte";
import BoardStage from "$lib/components/board/BoardStage.svelte";
import BoardTextEditor from "$lib/components/board/BoardTextEditor.svelte";
import BoardTimeline from "$lib/components/board/BoardTimeline.svelte";
import BoardZoomMenu from "$lib/components/board/BoardZoomMenu.svelte";
import { getLocale } from "$lib/i18n/locale.svelte";
import { m } from "$lib/paraglide/messages.js";
import { sdk } from "$lib/sdk";
import { mergeCachedTaskRun } from "$lib/stores/task-runs-cache";

const {
	path,
	boardId,
	document: initialDocument,
	playback = null,
	spaceId,
	shell,
	onNavigationOpen,
	mode = "edit",
	assetSource,
	active = true,
	immersive = false,
	syncError = null,
	isMobile = false,
	collaborators = new Map(),
	activities = [],
	onOpenActivity,
	onCommit,
	onPlayback,
	onRetrySync,
	onViewStateChange,
	onOpenFile,
	onOpenTask,
	onOpenApp,
	lod,
	deviceTier,
	onStageReady,
}: BoardRuntimeProps & {
	onOpenTask?: (taskRunId: string) => void;
} = $props();

const locale = $derived(getLocale());

let scriptStage = $state.raw<BoardStageController | null>(null);
const readonly = $derived(mode === "view");
const resolvedAssetSource = $derived(
	assetSource ?? createSpaceBoardAssetSource(spaceId),
);

const signals = readBoardDeviceSignals();
const saveData = signals.saveData;
const forced = untrack(
	() => deviceTier && boardDeviceBudget(signals, deviceTier),
);
const assets = createBoardAssetManager({
	loadVideoPreviews: !saveData,
	concurrency: forced?.concurrency,
	lruBudget: forced?.lru,
	resolveFile: (path, options) =>
		untrack(() => resolvedAssetSource).resolveFile(path, options),
	subscribe: untrack(() => resolvedAssetSource).subscribe,
	modelPreviews: saveData
		? undefined
		: createBoardModelPreviews(() => untrack(() => resolvedAssetSource), {
				isMobile: untrack(() => isMobile),
			}),
});
const boardLod = $derived(lod ?? forced?.lod);
const appDetails = createBoardAppDetailLoader();
const liveApps = new SvelteSet<string>();
const itemViews = [
	createBoardAppItemView({
		details: appDetails,
		isLive: (id) => liveApps.has(id),
		onRun: runApp,
		shell: () => shell,
		onNavigationOpen: () => onNavigationOpen,
	}),
];

function runApp(id: string) {
	liveApps.add(id);
	editor.setSelection([id]);
	editor.enteredId = id;
}

function stopApp(id: string) {
	liveApps.delete(id);
	if (editor.enteredId === id) editor.enteredId = null;
}

const appActions = $derived.by<BoardMenuAction[]>(() => {
	const [item] = editor.selectedItems;
	const app =
		editor.selectedItems.length === 1 && item ? boardAppMeta(item) : null;
	if (!item || !app) return [];
	const live = liveApps.has(item.id);
	const actions: BoardMenuAction[] = [
		live
			? {
					label: m.board_app_stop({}, { locale }),
					icon: Square,
					run: () => stopApp(item.id),
				}
			: {
					label: m.board_app_run({}, { locale }),
					icon: Play,
					run: () => runApp(item.id),
				},
		{
			label: m.board_app_open_tab({}, { locale }),
			icon: ExternalLink,
			run: () => {
				const url = boardAppOpenUrl(app, appDetails.peek(app.appId));
				if (url) window.open(url, "_blank", "noopener,noreferrer");
			},
		},
	];
	if (onOpenApp && !isMobile)
		actions.push({
			label: m.board_app_open_window({}, { locale }),
			icon: AppWindow,
			run: () => onOpenApp({ appId: app.appId, name: app.name }),
		});
	return actions;
});

let contextMenu = $state<{ x: number; y: number } | null>(null);
let exportBridge = $state<BoardStageExportBridge | null>(null);
let exportOpen = $state(false);
let generationOpen = $state(false);
let appearanceOpen = $state(false);
let linkRequest = $state<{ url: string; at: WorldPoint } | null>(null);

function openLink(url = "", at = editor.viewCenter()) {
	contextMenu = null;
	generationOpen = false;
	appearanceOpen = false;
	linkRequest = { url, at };
}

function toggleGeneration() {
	linkRequest = null;
	generationOpen = !generationOpen;
	appearanceOpen = false;
}

function toggleAppearance() {
	linkRequest = null;
	appearanceOpen = !appearanceOpen;
	generationOpen = false;
}

function toggleTimeline() {
	linkRequest = null;
	timelineOpen = !timelineOpen;
	if (!timelineOpen) editor.setPlayhead(null);
}

function addLink(url: string, kind: BoardMediaItemKind) {
	const at = linkRequest?.at ?? editor.viewCenter();
	editor.setSelection([editor.addMedia(url, at, { kind })]);
	linkRequest = null;
}

function addLinks(urls: string[], at = editor.viewCenter()) {
	if (urls.length === 1) {
		const url = urls[0] as string;
		const kind = inferBoardMediaKind(url);
		if ((kind === "file" || kind === "text") && !boardModelFormat(url)) {
			openLink(url, at);
			return;
		}
	}
	editor.addItems(
		urls.map((url, index) =>
			createMediaBoardItem(url, at.x + index * 36, at.y),
		),
		{ select: true },
	);
}

function pasteText(text: string) {
	const url = normalizeBoardRemoteUrl(text);
	if (url) addLinks([url]);
	else editor.pasteClipboard(text);
}

function handlePaste(event: ClipboardEvent) {
	if (
		!active ||
		readonly ||
		generationOpen ||
		replayOpen ||
		linkRequest ||
		editor.editingId ||
		isEditableTarget(event.target)
	)
		return;
	const text = event.clipboardData?.getData("text/plain");
	if (!text) return;
	event.preventDefault();
	pasteText(text);
}

const checkedTasks = new Set<string>();
$effect(() => {
	if (readonly) return;
	const unsettled = new Map<string, string[]>();
	for (const item of editor.items) {
		if (item.type !== "task" || checkedTasks.has(item.id)) continue;
		const { status } = item.props.snapshot;
		if (status !== "pending" && status !== "running") continue;
		checkedTasks.add(item.id);
		const ids = unsettled.get(item.props.taskRunId) ?? [];
		unsettled.set(item.props.taskRunId, [...ids, item.id]);
	}
	if (unsettled.size) untrack(() => void recheckTasks(unsettled));
});

async function recheckTasks(cards: ReadonlyMap<string, readonly string[]>) {
	const runIds = [...cards.keys()];
	for (let start = 0; start < runIds.length; start += 100) {
		const { runs } = await sdk.tasks
			.getMany(runIds.slice(start, start + 100), { spaceId })
			.catch(() => ({ runs: [] }));
		const items: NonNullable<BoardPatch["items"]> = {};
		for (const run of runs) {
			mergeCachedTaskRun(spaceId, run);
			if (run.status !== "completed" && run.status !== "failed") continue;
			for (const id of cards.get(run.id) ?? [])
				items[id] = { props: { taskRunId: run.id } };
		}
		if (Object.keys(items).length)
			await boardClient.apply({ items }).catch(() => undefined);
	}
}

async function addTaskResults(itemId: string) {
	const task = editor.itemById(itemId);
	if (task?.type !== "task") return;
	const { taskRunId, snapshot } = task.props;
	let artifacts = snapshot.artifacts;
	if (snapshot.artifactCount > artifacts.length) {
		try {
			artifacts = taskRunArtifacts((await sdk.tasks.get(taskRunId)).run);
		} catch {}
	}
	const current = editor.itemById(itemId);
	if (current?.type !== "task") return;
	const existing = new Map<string, string>();
	for (const item of editor.items) {
		const origin = boardItemOrigin(item);
		if (origin?.taskRunId === taskRunId)
			existing.set(boardOriginKey(origin), item.id);
	}
	const entries = createTaskResultItems({
		taskRunId,
		frame: current.frame,
		artifacts,
		existing: new Set(existing.keys()),
	});
	if (entries.length) editor.addItems(entries, { select: false });
	const ids = [...existing.values(), ...entries.map((entry) => entry.id)];
	if (!ids.length) return;
	editor.setSelection(ids);
	editor.focusItems(ids);
}

function showSource(itemId: string) {
	const item = editor.itemById(itemId);
	const origin = item ? boardItemOrigin(item) : null;
	if (!origin) return;
	const card = editor.items.find(
		(candidate) =>
			candidate.type === "task" &&
			candidate.props.taskRunId === origin.taskRunId,
	);
	if (!card) {
		void onOpenTask?.(origin.taskRunId);
		return;
	}
	editor.setSelection([card.id]);
	editor.focusItems([card.id]);
}

const relatedIds = $derived.by(() => {
	const selected = editor.selectedItems;
	if (selected.length !== 1 || !selected[0]) return [];
	const item = selected[0];
	const taskRunId =
		item.type === "task"
			? item.props.taskRunId
			: boardItemOrigin(item)?.taskRunId;
	if (!taskRunId) return [];
	return editor.items.flatMap((other) =>
		other.id !== item.id &&
		(other.type === "task"
			? other.props.taskRunId === taskRunId
			: boardItemOrigin(other)?.taskRunId === taskRunId)
			? [other.id]
			: [],
	);
});

function openMediaSource(src: string) {
	const source = parseBoardMediaSource(src);
	if (source?.kind === "url")
		window.open(source.value, "_blank", "noopener,noreferrer");
	else if (source?.kind === "file") void onOpenFile?.(source.value);
}
let replayOpen = $state(false);
let timelineOpen = $state(false);
let localPlayback = $state<BoardPlaybackSnapshot | null>(null);
const activePlayback = $derived(onPlayback ? playback : localPlayback);

function sendPlayback(command: BoardPlaybackCommand) {
	if (command.type === "play" || command.type === "resume") {
		editor.setCameraPolicy("follow");
	}
	if (onPlayback) return onPlayback(command);
	localPlayback = nextLocalPlayback(localPlayback, command, editor.document);
}
let liveVersion = $state(0);
let backdropStatus = $state<BoardBackdropStatus | null>(null);
let generationSelectionRequest = $state(0);
let playingId = $state<string | null>(null);
let modelId = $state<string | null>(null);
let regeneratingItemId = $state<string | null>(null);
let regenerationError = $state<string | null>(null);
let regenerationErrorTimer: ReturnType<typeof setTimeout> | null = null;
let awarenessVersion = $state(0);
let surfaceSize = $state<{ width: number; height: number }>({
	width: 0,
	height: 0,
});
let unsubscribeAwareness: (() => void) | null = null;
const viewPreferenceUserKey = untrack(() => getCacheUserKey());
const viewPreferenceEnabled = untrack(
	() => mode === "edit" && canUseUserScopedCache(viewPreferenceUserKey),
);
const restoredViewPreference = viewPreferenceEnabled
	? untrack(() =>
			readBoardViewPreference(viewPreferenceUserKey, spaceId, boardId),
		)
	: null;
let viewPreferenceRestored = false;
let pendingViewPreference: BoardViewPreference | null = null;
let viewPreferenceTimer: ReturnType<typeof setTimeout> | null = null;

function addSelectionToGeneration() {
	generationOpen = true;
	generationSelectionRequest += 1;
}

function openInPlace(itemId: string) {
	const item = editor.itemById(itemId);
	if (!opensInPlace(item, resolvedAssetSource)) return;
	const model = isBoardModelItem(item);
	modelId = model ? itemId : null;
	playingId = model ? null : itemId;
}

function closeInPlace() {
	playingId = null;
	modelId = null;
}

function openExport() {
	if (!exportBridge) return;
	contextMenu = null;
	exportOpen = true;
}

function showRegenerationError(message: string) {
	regenerationError = message;
	if (regenerationErrorTimer) clearTimeout(regenerationErrorTimer);
	regenerationErrorTimer = setTimeout(() => {
		regenerationError = null;
		regenerationErrorTimer = null;
	}, 6000);
}

async function regenerateTask(itemId: string) {
	if (regeneratingItemId) return;
	const source = editor.itemById(itemId);
	if (
		source?.type !== "task" ||
		source.props.snapshot.taskType !== "generation"
	)
		return;
	const sourceFrame = { ...source.frame };
	const submittingUserKey = getCacheUserKey();
	let createdTaskRunId: string | null = null;
	regeneratingItemId = itemId;
	regenerationError = null;
	try {
		const detail = await sdk.tasks.get(source.props.taskRunId);
		const request = regenerationRequestFromTaskRun(detail.run, spaceId);
		const created = await sdk.generations.create(request);
		createdTaskRunId = created.taskRunId;
		if (getCacheUserKey() !== submittingUserKey) {
			showRegenerationError(m.board_task_created({}, { locale }));
			return;
		}

		const snapshot = pendingGenerationTaskSnapshot({
			prompt: generationPromptFromContent(request.content),
			model: request.model,
		});
		const aspect = sourceFrame.width / sourceFrame.height;
		const position = pendingTaskPosition(
			sourceFrame,
			boardTaskCardSize(snapshot, aspect),
		);
		editor.addTaskWithSources(
			created.taskRunId,
			snapshot,
			worldPoint(position.x, position.y),
			[{ itemId: source.id, sourcePortId: "artifacts", targetPortId: "input" }],
			{
				regeneration: {
					sourceTaskRunId: source.props.taskRunId,
					sourceItemId: source.id,
				},
			},
			aspect,
		);
	} catch (cause) {
		showRegenerationError(
			createdTaskRunId
				? m.board_generation_started_detail({}, { locale })
				: cause instanceof Error
					? cause.message
					: m.board_generation_start_failed({}, { locale }),
		);
	} finally {
		regeneratingItemId = null;
	}
}

const boardClient = sdk
	.space(untrack(() => spaceId))
	.board(untrack(() => boardId));
const fetchHistory = boardClient.history.bind(boardClient);
async function fetchDocument() {
	const result = await boardClient.get();
	const parsed = parseBoardDocument({
		board: result.board,
		items: result.items ?? {},
		animations: result.animations ?? {},
	});
	if (!parsed.ok) throw new Error(m.board_replay_failed({}, { locale }));
	return { version: result.version, document: parsed.document };
}
const awareness: BoardAwarenessController = createBoardAwarenessController({
	send: (seq, update) => boardClient.updateAwareness(seq, update),
	onChange: () => {
		awarenessVersion += 1;
	},
});

const editor = createBoardEditor({
	document: untrack(() => initialDocument),
	initialTool: untrack(() =>
		mode === "view" ? "hand" : defaultBoardTool(isMobile),
	),
	key: untrack(() => path),
	readonly: untrack(() => mode === "view"),
	onCommit: (patch) => onCommit?.(patch),
	onViewStateChange: (state) => {
		onViewStateChange?.({ path, ...state });
	},
});

function flushViewPreference() {
	if (viewPreferenceTimer) clearTimeout(viewPreferenceTimer);
	viewPreferenceTimer = null;
	if (!viewPreferenceEnabled || !pendingViewPreference) return;
	writeBoardViewPreference(
		viewPreferenceUserKey,
		spaceId,
		boardId,
		pendingViewPreference,
	);
	pendingViewPreference = null;
}

function scheduleViewPreference(preference: BoardViewPreference) {
	pendingViewPreference = preference;
	if (viewPreferenceTimer) clearTimeout(viewPreferenceTimer);
	viewPreferenceTimer = setTimeout(flushViewPreference, 300);
}

function handleSurfaceChange(size: { width: number; height: number }) {
	surfaceSize = size;
	if (viewPreferenceRestored || size.width <= 0 || size.height <= 0) return;
	viewPreferenceRestored = true;
	const camera = restoredViewPreference
		? cameraFromBoardViewPreference(restoredViewPreference, size)
		: null;
	if (camera) editor.setCamera(camera);
	else editor.fitView({ animate: false, maxZoom: 1 });
}

$effect(() => {
	const camera = editor.camera;
	const surface = surfaceSize;
	if (!viewPreferenceEnabled || !viewPreferenceRestored) return;
	const preference = boardViewPreferenceFromCamera(camera, surface);
	if (preference) untrack(() => scheduleViewPreference(preference));
});

$effect(() => {
	const doc = initialDocument;
	const k = path;
	untrack(() => editor.loadDocument(doc, k));
});

$effect(() => {
	if (readonly) return;
	const viewport = boardAwarenessViewportFromCamera(editor.camera, surfaceSize);
	untrack(() => awareness.setViewport(viewport));
});

$effect(() => {
	if (readonly) return;
	const tool = editor.tool;
	const selection = editor.selection;
	const bounds = editor.bounds;
	const editingId = editor.editingId;
	const formFactor = isMobile ? ("mobile" as const) : ("desktop" as const);
	untrack(() =>
		awareness.updateLocalState({
			client: { formFactor },
			tool,
			selection,
			bounds,
			editingId,
		}),
	);
});

$effect(() => {
	if (readonly) return;
	editor.interaction;
	editor.geometryVersion;
	untrack(() => awareness.syncGesture(editor));
});

$effect(() => {
	if (readonly) return;
	awarenessVersion;
	const items = editor.items;
	untrack(() => awareness.reconcile(items));
});

const boardActivities = $derived(
	activities.filter((activity) => activity.boardId === boardId),
);

const peers = $derived.by(() => {
	awarenessVersion;
	return awareness.peers;
});

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	return (
		tag === "INPUT" ||
		tag === "TEXTAREA" ||
		tag === "SELECT" ||
		tag === "AUDIO" ||
		tag === "VIDEO" ||
		target.isContentEditable
	);
}

async function writeClipboard(payload: unknown) {
	const text = JSON.stringify(payload);
	try {
		if (navigator.clipboard?.writeText)
			await navigator.clipboard.writeText(text);
	} catch {}
}

async function readClipboardText(): Promise<string | null> {
	try {
		if (navigator.clipboard?.readText)
			return await navigator.clipboard.readText();
	} catch {}
	return null;
}

function openItem(item: BoardSceneItem): boolean {
	if (boardAppMeta(item)) {
		runApp(item.id);
		return true;
	}
	if (opensInPlace(item, resolvedAssetSource)) {
		openInPlace(item.id);
		return true;
	}
	if (item.type === "file") {
		const source = parseBoardMediaSource(item.props.src);
		if (source?.kind !== "url" && !onOpenFile) return false;
		openMediaSource(item.props.src);
		return true;
	}
	if (item.type === "task" && onOpenTask) {
		void onOpenTask(item.props.taskRunId);
		return true;
	}
	return false;
}

function runHostCommand(command: BoardKeyCommand): boolean {
	switch (command.type) {
		case "copy":
		case "cut": {
			const payload =
				command.type === "copy"
					? editor.copySelection()
					: editor.cutSelection();
			if (payload) void writeClipboard(payload);
			return payload !== null;
		}
		case "paste":
			void (async () => {
				const text = await readClipboardText();
				if (text) pasteText(text);
				else editor.pasteClipboard();
			})();
			return true;
		case "export":
			openExport();
			return true;
		case "open": {
			const [single] = editor.selectedItems;
			return editor.selection.length === 1 && single ? openItem(single) : false;
		}
		case "escape":
			if (!contextMenu) return false;
			contextMenu = null;
			return true;
		default:
			return false;
	}
}

function handleKeydown(event: KeyboardEvent) {
	if (!active || generationOpen || replayOpen) return;
	if (linkRequest) {
		if (event.key === "Escape") {
			event.preventDefault();
			linkRequest = null;
		}
		return;
	}
	if (event.key === "Escape" && (playingId || modelId)) {
		event.preventDefault();
		closeInPlace();
		return;
	}
	if (isEditableTarget(event.target)) return;
	handleBoardKeyDown(editor, event, runHostCommand);
}

function handleKeyup(event: KeyboardEvent) {
	if (active) handleBoardKeyUp(editor, event);
}

function clearSpaceHeld() {
	editor.spaceHeld = false;
	awareness.setCursor(null);
}

function handleVisibilityChange() {
	clearSpaceHeld();
	if (document.visibilityState === "hidden") flushViewPreference();
}

function retrySync() {
	if (editor.saveError) {
		editor.retrySave();
		return;
	}
	void onRetrySync?.();
}

function handleContextMenu(request: BoardContextMenuRequest): boolean {
	if (!active || readonly) return false;
	contextMenu = { x: request.clientX, y: request.clientY };
	return true;
}

function blockPageZoom(node: HTMLElement) {
	const block = (event: Event) => {
		if (
			event.type !== "wheel" ||
			(event as WheelEvent).ctrlKey ||
			(event as WheelEvent).metaKey
		)
			event.preventDefault();
	};
	const types = ["wheel", "gesturestart", "gesturechange"];
	for (const type of types)
		node.addEventListener(type, block, { passive: false });
	return {
		destroy() {
			for (const type of types) node.removeEventListener(type, block);
		},
	};
}

onMount(() => {
	if (!readonly) {
		unsubscribeAwareness = boardClient.subscribe({
			awareness: (event) => awareness.receive(event),
			changed: (event) => {
				liveVersion = Math.max(liveVersion, event.payload.version);
			},
		});
	}
	window.addEventListener("paste", handlePaste);
	window.addEventListener("keydown", handleKeydown);
	window.addEventListener("keyup", handleKeyup);
	window.addEventListener("blur", clearSpaceHeld);
	window.addEventListener("pagehide", flushViewPreference);
	document.addEventListener("visibilitychange", handleVisibilityChange);
	return () => {
		window.removeEventListener("paste", handlePaste);
		window.removeEventListener("keydown", handleKeydown);
		window.removeEventListener("keyup", handleKeyup);
		window.removeEventListener("blur", clearSpaceHeld);
		window.removeEventListener("pagehide", flushViewPreference);
		document.removeEventListener("visibilitychange", handleVisibilityChange);
		const unsubscribe = unsubscribeAwareness;
		unsubscribeAwareness = null;
		void awareness.destroy().finally(() => unsubscribe?.());
	};
});

$effect(() => {
	if (active) return;
	contextMenu = null;
	closeInPlace();
	exportOpen = false;
	generationOpen = false;
	replayOpen = false;
	linkRequest = null;
	clearSpaceHeld();
});

onDestroy(() => {
	if (regenerationErrorTimer) clearTimeout(regenerationErrorTimer);
	flushViewPreference();
	window.removeEventListener("paste", handlePaste);
	window.removeEventListener("keydown", handleKeydown);
	window.removeEventListener("keyup", handleKeyup);
	window.removeEventListener("blur", clearSpaceHeld);
	window.removeEventListener("pagehide", flushViewPreference);
	document.removeEventListener("visibilitychange", handleVisibilityChange);
	editor.spaceHeld = false;
	const unsubscribe = unsubscribeAwareness;
	unsubscribeAwareness = null;
	void awareness.destroy().finally(() => unsubscribe?.());
	editor.destroy();
	assets.destroy();
});
</script>

<div
	class="board-panel flex h-full min-w-0 flex-col bg-bg-primary"
	class:board-panel--immersive={immersive}
	data-drawer-swipe-ignore
>
	{#if syncError || editor.saveError}
		<div
			class="board-sync-notice flex shrink-0 items-center gap-2 border-b border-error-soft/20 bg-error-bg px-3 py-1.5 text-[11px] text-error-soft"
			class:board-sync-notice--immersive={immersive}
		>
			<span class="min-w-0 flex-1 truncate">{m.board_sync_paused({}, { locale })}</span>
			<button type="button" class="action-btn" onclick={retrySync}>{m.common_retry({}, { locale })}</button>
		</div>
	{/if}

	<div
		class="relative min-h-0 flex-1 bg-bg-primary"
		role="application"
		use:blockPageZoom
	>
		{#if regenerationError}
			<div class="board-regeneration-notice" role="status" aria-live="polite">
				{regenerationError}
			</div>
		{/if}

		<BoardStage
			onStageReady={(stage) => {
				scriptStage = stage;
				onStageReady?.(stage);
			}}
			lod={boardLod}
			prefetch={forced?.prefetch}
			{editor}
			playback={activePlayback}
			{assets}
			{active}
			{awareness}
			{awarenessVersion}
			{spaceId}
			{readonly}
			assetSource={resolvedAssetSource}
			onOpenFile={openMediaSource}
			onAddLinks={addLinks}
			onOpenInPlace={openInPlace}
			onPointerPresence={(cursor) => { if (!readonly) awareness.setCursor(cursor); }}
			views={itemViews}
			onSurfaceChange={handleSurfaceChange}
			onExportReady={(bridge) => { exportBridge = bridge; }}
			onBackdropChange={(status) => { backdropStatus = status; }}
			onContextMenu={handleContextMenu}
			onActivate={openItem}
			{relatedIds}
		/>

		<BoardScripts {editor} {readonly} stage={scriptStage} />

		{#if !readonly}
			<BoardCollaboratorOverlay
				peers={peers}
				activities={boardActivities}
				profiles={collaborators}
				camera={editor.camera}
				surface={surfaceSize}
				cursorVisibleMs={awareness.cursorVisibleMs}
				{isMobile}
				onOpenActivity={(activity) => { void onOpenActivity?.(activity); }}
			/>
		{/if}

		{#if !editor.hasContent && !readonly}
			<BoardEmptyState
				onAddText={() => editor.beginTextDraft(editor.viewCenter())}
				onAddShape={() => editor.addShape(editor.viewCenter())}
			/>
		{/if}

		{#if !readonly}
			<BoardTextEditor {editor} stage={scriptStage} />
		{/if}
		<BoardMediaPlayer
			{editor}
			assetSource={resolvedAssetSource}
			{playingId}
			{active}
			surface={surfaceSize}
			onClose={closeInPlace}
		/>
		{#if modelId}
			<BoardModelViewer
				{editor}
				assetSource={resolvedAssetSource}
				itemId={modelId}
				{isMobile}
				onOpenFile={openMediaSource}
				onClose={closeInPlace}
			/>
		{/if}
		{#if !readonly && !isMobile}
			<BoardSelectionToolbar
				{editor}
				itemActions={appActions}
				onAddTaskResults={addTaskResults}
				onShowSource={showSource}
				onRegenerateTask={regenerateTask}
				onAddToGeneration={addSelectionToGeneration}
				{regeneratingItemId}
			/>
			<BoardArrowToolbar {editor} />
			<BoardFloatingToolbar
				onAddLink={() => openLink()}
				{editor}
				{immersive}
				{generationOpen}
				{appearanceOpen}
				{timelineOpen}
				onToggleGeneration={toggleGeneration}
				onToggleAppearance={toggleAppearance}
				onToggleTimeline={toggleTimeline}
			/>
		{/if}
		{#if isMobile}
			<BoardMobileChrome
				onAddLink={() => openLink()}
				{editor}
				{readonly}
				{appearanceOpen}
				{generationOpen}
				{timelineOpen}
				onToggleAppearance={toggleAppearance}
				onToggleGeneration={toggleGeneration}
				onToggleTimeline={toggleTimeline}
				onExport={exportBridge ? openExport : undefined}
				onReplay={() => { replayOpen = true; }}
				contextMenuOpen={contextMenu !== null}
			/>
		{/if}
		{#if !readonly && linkRequest}
			{#key linkRequest}
				<BoardLinkPopover initialUrl={linkRequest.url} onAdd={addLink} onClose={() => { linkRequest = null; }} />
			{/key}
		{/if}
		{#if !readonly && generationOpen}
			<BoardGenerationComposer
				{editor}
				{spaceId}
				{boardId}
				assetSource={resolvedAssetSource}
				{immersive}
				selectionAddRequest={generationSelectionRequest}
				onClose={() => { generationOpen = false; }}
			/>
		{/if}
		{#if !readonly}
			{#if appearanceOpen}
				<div class="board-appearance-anchor">
					<BoardAppearancePopover
						{editor}
						{backdropStatus}
						onClose={() => { appearanceOpen = false; }}
					/>
				</div>
			{/if}
		{/if}
		{#if !isMobile}
			<BoardZoomMenu
				{editor} {immersive} {timelineOpen}
				onToggleTimeline={readonly && Object.keys(editor.animations).length ? () => {
					timelineOpen = !timelineOpen;
					if (!timelineOpen) editor.setPlayhead(null);
				} : undefined}
			/>
		{/if}
		{#if timelineOpen}
			<BoardTimeline
				{editor}
				playback={activePlayback}
				{readonly}
				onPlayback={sendPlayback}
				onClose={() => { timelineOpen = false; editor.setPlayhead(null); }}
			/>
		{/if}

		{#if replayOpen}
			{#await import("$lib/components/board/BoardReplayView.svelte") then { default: BoardReplayView }}
				<BoardReplayView
					{boardId}
					{path}
					{spaceId}
					{assets}
					assetSource={resolvedAssetSource}
					initialDocument={editor.document}
					initialCamera={editor.camera}
					profiles={collaborators}
					{isMobile}
					{fetchHistory}
					{fetchDocument}
					{liveVersion}
					onClose={() => { replayOpen = false; }}
				/>
			{/await}
		{/if}

		{#if contextMenu}
			<BoardContextMenu
				{editor}
				itemActions={appActions}
				onOpenFile={openMediaSource}
				onAddLink={!readonly ? () => openLink() : undefined}
				onAddTaskResults={!readonly ? addTaskResults : undefined}
				onShowSource={showSource}
				{onOpenTask}
				onRegenerateTask={regenerateTask}
				{regeneratingItemId}
				onAddToGeneration={addSelectionToGeneration}
				position={contextMenu}
				sheet={isMobile}
				onExport={exportBridge ? openExport : undefined}
				onReplay={!readonly ? () => { contextMenu = null; replayOpen = true; } : undefined}
				onAnimate={!readonly ? () => { contextMenu = null; timelineOpen = true; } : undefined}
				onClose={() => { contextMenu = null; }}
			/>
		{/if}
	</div>
</div>

<BoardExportDialog
	open={exportOpen}
	onClose={() => { exportOpen = false; }}
	document={editor.document}
	bridge={exportBridge}
	title={path}
	selection={editor.selection}
	onLocate={(id) => { editor.setSelection([id]); editor.focusItems([id]); }}
/>

<style>
	.board-panel--immersive {
		position: relative;
	}

	.board-appearance-anchor {
		position: absolute;
		left: 50%;
		bottom: 68px;
		z-index: 30;
		transform: translateX(-50%);
	}

	@media (pointer: coarse) {
		.board-appearance-anchor {
			left: 12px;
			right: 12px;
			bottom: 74px;
			transform: none;
		}
		.board-appearance-anchor :global(.appearance-popover) {
			width: min(360px, 100%);
			margin-inline: auto;
		}
	}

	.board-regeneration-notice {
		position: absolute;
		top: 12px;
		left: 50%;
		z-index: 32;
		max-width: min(420px, calc(100% - 24px));
		transform: translateX(-50%);
		border: 1px solid var(--color-error-soft);
		border-radius: 7px;
		background: var(--color-error-bg);
		padding: 7px 10px;
		color: var(--color-error-soft);
		font-size: 11px;
		box-shadow: 0 8px 20px color-mix(in srgb, var(--overlay-scrim-strong) 12%, transparent);
	}

	.board-sync-notice--immersive {
		position: absolute;
		top: 58px;
		right: var(--preview-safe-right, 10px);
		z-index: 30;
		max-width: min(420px, calc(100% - var(--preview-safe-left, 10px) - var(--preview-safe-right, 10px)));
		border: 1px solid var(--color-error-soft);
		border-radius: 7px;
		box-shadow: 0 8px 20px color-mix(in srgb, var(--overlay-scrim-strong) 12%, transparent);
	}
</style>
