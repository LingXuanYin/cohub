<script lang="ts">
import { onMount, tick } from "svelte";
import { MotionScope } from "./motion";
import {
	ArrowDownToLine,
	ArrowUpFromLine,
	ArrowUpRight,
	Check,
	CircleHelp,
	Layers,
	Leaf,
	LoaderCircle,
	MessageCircle,
	Moon,
	Pause,
	Play,
	Sparkles,
	SquarePen,
	Sun,
	X,
} from "lucide-svelte";
import type { BoardDocument } from "@neta-art/cohub/board";
import { WorldController, type WorldView } from "./controller";
import {
	cards,
	cardSnapshot,
	kindLabel,
	kinds,
	readWork,
	seed,
	sanitizeImported,
	type Card,
	type Kind,
} from "./world";
import { suggestionsFor } from "./creation";
import ConversationPanel from "./ConversationPanel.svelte";
import CreationPanel from "./CreationPanel.svelte";
import ThoughtPanel from "./ThoughtPanel.svelte";
import ComposePanel from "./ComposePanel.svelte";
import ConnectionPanel from "./ConnectionPanel.svelte";
import WorldCatalog from "./WorldCatalog.svelte";
import BoardToolbar from "./BoardToolbar.svelte";
import { connectBoard, type BoardConnection } from "./sync";
import type { BoardReplicaState } from "@neta-art/cohub/board/replica";
import { DraftStore, download, DRAFT_KEY } from "./storage";
import { authorize, context, createCloudSave, createStory } from "./cohub";
import * as m from "./paraglide/messages.js";
import { getLocale, setLocale } from "./paraglide/runtime.js";

let host: HTMLDivElement;
let upload: HTMLInputElement;
let controller = $state<WorldController | null>(null);
let view = $state.raw<WorldView | null>(null);
let notice = $state("");
let error = $state(false);
let saved = $state(true);
let dark = $state(false);
let paused = $state(false);
let indexOpen = $state(false);
let dismissed = $state("");
let thoughtOrigin = $state.raw<DOMRect | null>(null);
let layoutMotion: MotionScope | null = null;
let explore = $state<string | null>(null);
let hoverAction = $state<string | null>(null);
let sideTab = $state<"create" | "world">("create");
let talking = $state<string | null>(null);
let mobileBoard = $state(false);
let mounted = false;
let returnView: {
	camera: { x: number; y: number; zoom: number };
	selection: string[];
} | null = null;
let connection = $state.raw<BoardConnection | null>(null);
let syncState = $state.raw<BoardReplicaState | null>(null);
let connectOpen = $state(false);
let boardId = $state("");
let syncBusy = $state(false);
let localBeforeRemote: BoardDocument | null = null;
let offer = $state<string[]>([]);
let form = $state<"idea" | "edit" | "fusion" | null>(null);
let editing = $state.raw<Card | null>(null);
let title = $state("");
let body = $state("");
let kind = $state<Kind>("idea");
let intent = $state("");
let ai = $state(false);
let spaceId = $state<string | undefined>();
let runtime = $state(false);
let busy = $state(false);
let cloudBusy = $state(false);
let tool = $state<"select" | "hand">("select");
let viewportWidth = $state(1200);
let formReady = $state(false);
const FORM_KEY = "neta-world:form:v1";
let draft: DraftStore;
let pendingCreation: { key: string; card: Card } | null = null;
let request: AbortController | null = null;
let cloudOperation: ReturnType<typeof createCloudSave> | null = null;
let cloudSnapshot: BoardDocument | null = null;
$effect(() => {
	controller?.setActive(
		!document.hidden && (!talking || mobileBoard || viewportWidth > 760),
	);
});
$effect(() => {
	if (!formReady) return;
	const snapshot = {
		form,
		title,
		body,
		kind,
		intent,
		editing: editing?.id,
		sources: selectionKey ? selectionKey.split(":") : [],
	};
	try {
		sessionStorage.setItem(FORM_KEY, JSON.stringify(snapshot));
	} catch {
		show(m.save_failed(), true);
	}
});
const all = $derived(view?.cards ?? []);
const selected = $derived(view?.selected ?? []);
const selectionKey = $derived(selected.map((c) => c.id).join(":"));
const chosen = $derived(selected[0]);
const panel = $derived(
	!form &&
		!talking &&
		chosen &&
		explore === selectionKey &&
		selectionKey !== dismissed,
);
const suggestions = $derived(
	chosen ? suggestionsFor(chosen, controller?.related(chosen.id) ?? []) : [],
);
const records = $derived(
	all
		.filter((card) => card.creation)
		.slice(-12)
		.reverse(),
);
const talkingCard = $derived(all.find((card) => card.id === talking));
const actionCard = $derived(
	all.find((card) => card.id === (hoverAction ?? chosen?.id)),
);
const actionPosition = $derived.by(() => {
	if (!view || !controller || !actionCard) return null;
	const r = controller.screenRect(actionCard.id);
	return r
		? {
				x: Math.max(
					12,
					Math.min(r.x + r.width - 100, controller.safeRect().width - 95),
				),
				y: Math.max(12, r.y - 38),
			}
		: null;
});
const words = $derived(
	selected
		.flatMap((c) => [
			c.title,
			kindLabel(c.kind),
			...c.body
				.split(/[，。！？,.!?:：\s]+/)
				.filter((s) => s.length > 1)
				.map((s) => s.slice(0, 9)),
		])
		.slice(0, 9),
);
const placement = $derived.by(() => {
	if (!view || !controller || !chosen) return null;
	void view.zoom;
	return controller.overlay(chosen.id, { width: 294, height: 460 });
});
const locale = getLocale();
function show(text: string, failure = false) {
	notice = text;
	error = failure;
}
function persist(document: BoardDocument) {
	try {
		draft.save(document);
		saved = true;
	} catch (cause) {
		saved = false;
		show(m.save_failed(), true);
		throw cause;
	}
}
function inspect(ids: string[]) {
	thoughtOrigin = ids[0] ? (controller?.clientRect(ids[0]) ?? null) : null;
	controller?.highlight(ids);
	controller?.select(ids);
	explore = ids.join(":");
	dismissed = "";
	indexOpen = false;
}
function setTool(next: "select" | "hand") {
	tool = next;
	if (controller) controller.editor.tool = next;
}
function toggleTheme() {
	dark = !dark;
	controller?.setTheme(dark);
}
function togglePause() {
	paused = !paused;
	controller?.pause(paused);
}
function selectCard(id: string, additive = false) {
	if (!controller) return;
	if (additive)
		controller.select(
			selected.some((c) => c.id === id)
				? selected.filter((c) => c.id !== id).map((c) => c.id)
				: [...selected.map((c) => c.id), id],
		);
	else {
		controller.focus(id);
		explore = null;
		dismissed = "";
		indexOpen = false;
	}
}
function startEdit() {
	if (busy || !chosen) return;
	editing = chosen;
	form = "edit";
	title = chosen.title;
	body = chosen.body;
	kind = chosen.kind;
}
function startIdea() {
	if (busy) return;
	editing = null;
	form = "idea";
	title = "";
	body = "";
	kind = "idea";
	indexOpen = false;
}
function startFusion() {
	if (busy) return;
	form = "fusion";
	intent ||= m.default_intent();
	indexOpen = false;
}
async function addIdea(event: SubmitEvent) {
	event.preventDefault();
	if (!title.trim() || !body.trim()) {
		show(m.input_required(), true);
		return;
	}
	if (!controller || busy) return;
	busy = true;
	try {
		if (form === "edit" && editing)
			await controller.update({
				...editing,
				title: title.trim(),
				body: body.trim(),
				kind,
			});
		else
			await controller.add({
				id: crypto.randomUUID(),
				title: title.trim(),
				body: body.trim(),
				kind,
				sources: [],
				createdAt: new Date().toISOString(),
			});
		form = null;
		dismissed = controller
			.selected()
			.map((c) => c.id)
			.join(":");
		if (saved) show(m.saved());
	} catch {
		show(m.save_failed(), true);
	} finally {
		busy = false;
	}
}
async function accept(index: number) {
	const suggestion = suggestions[index];
	if (!controller || !chosen || !suggestion || busy) return;
	busy = true;
	try {
		await controller.add({
			id: crypto.randomUUID(),
			title: suggestion.title,
			kind: suggestion.kind,
			creation: {
				question: suggestion.title,
				explanation: suggestion.reason,
				basis: suggestion.basis.map(cardSnapshot),
				outputs: [],
			},
			sources: [chosen.id],
			prompt: suggestion.title,
			body: `${suggestion.body}\n\n${chosen.body}`,
			createdAt: new Date().toISOString(),
		});
		dismissed = controller
			.selected()
			.map((c) => c.id)
			.join(":");
		if (saved) show(m.status_born());
	} catch {
		show(m.save_failed(), true);
	} finally {
		busy = false;
	}
}
async function enableAI() {
	if (ai) {
		ai = false;
		return;
	}
	try {
		spaceId = await authorize(
			["session.prompt.readonly"],
			m.ai_permission(),
			spaceId,
		);
		ai = true;
	} catch {
		show(runtime ? m.ai_failed() : m.cloud_unavailable(), true);
	}
}
async function fuse(event: SubmitEvent) {
	event.preventDefault();
	if (!controller || busy || !selected.length) return;
	const sources = [...selected];
	const prompt = intent.trim() || m.default_intent();
	busy = true;
	const abort = new AbortController();
	request = abort;
	try {
		const key = JSON.stringify({ sources, prompt, ai, spaceId });
		if (!pendingCreation || pendingCreation.key !== key) {
			const story =
				ai && spaceId
					? await createStory(spaceId, sources, prompt, abort.signal)
					: {
							body: m.local_story({
								names: sources.map((c) => c.title).join(" / "),
								intent: prompt,
							}),
							prompt,
							raw: undefined,
						};
			if (abort.signal.aborted) return;
			pendingCreation = {
				key,
				card: {
					id: crypto.randomUUID(),
					kind: "story",
					title: prompt.length > 32 ? m.story_title() : prompt,
					...story,
					sources: sources.map((c) => c.id),
					sourceSnapshots: sources.map(({ id, title, body, kind }) => ({
						id,
						title,
						body,
						kind,
					})),
					createdAt: new Date().toISOString(),
					creation: {
						question: prompt,
						explanation: m.record_body({ question: prompt }),
						basis: sources.map(cardSnapshot),
						outputs: [],
					},
				},
			};
			try {
				draft.recordCreation(pendingCreation.card.id, pendingCreation.card);
			} catch {
				saved = false;
				show(m.save_failed(), true);
			}
		}
		await controller.add(pendingCreation.card);
		pendingCreation = null;
		form = null;
		intent = "";
		dismissed = controller
			.selected()
			.map((c) => c.id)
			.join(":");
		if (saved) show(m.status_born());
	} catch {
		if (!abort.signal.aborted) show(m.ai_failed(), true);
	} finally {
		busy = false;
		request = null;
	}
}
function closeForm() {
	request?.abort();
	form = null;
}
async function saveCloud() {
	if (!view || cloudBusy) return;
	cloudBusy = true;
	try {
		spaceId = await authorize(
			["file.edit", "file.view"],
			m.write_permission(),
			spaceId,
		);
		if (!cloudOperation || cloudSnapshot !== view.document) {
			cloudSnapshot = view.document;
			cloudOperation = createCloudSave(view.document);
		}
		const result = await cloudOperation(spaceId);
		show(m.cloud_saved({ path: result.path }));
		cloudOperation = null;
	} catch {
		show(runtime ? m.cloud_failed() : m.cloud_unavailable(), true);
	} finally {
		cloudBusy = false;
	}
}
function exportBoard() {
	if (view)
		download("neta-world.board.json", JSON.stringify(view.document, null, 2));
}
async function importBoard(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	if (!file || !controller || busy || talking || connection) return;
	try {
		const content = await file.text();
		const { document, paused: scriptsPaused } = sanitizeImported(
			JSON.parse(content),
		);
		draft.recordImport(file.name, content);
		draft.backup(controller.editor.document);
		draft.save(document);
		controller.editor.loadDocument(document, crypto.randomUUID());
		controller.fit();
		dismissed = "";
		form = null;
		saved = true;
		show(scriptsPaused ? m.import_scripts() : m.import_ok());
	} catch {
		show(m.import_failed(), true);
	} finally {
		input.value = "";
	}
}
async function createFromPrompt(text: string): Promise<boolean> {
	if (!controller || busy) return false;
	busy = true;
	const basis = selected.map(cardSnapshot);
	try {
		const id = crypto.randomUUID();
		await controller.add({
			id,
			kind: selected.length ? "story" : "idea",
			title: text.slice(0, 100),
			body: text,
			sources: selected.map((card) => card.id),
			sourceSnapshots: basis,
			creation: {
				question: text,
				explanation: m.record_body({ question: text }),
				basis,
				outputs: [id],
			},
			createdAt: new Date().toISOString(),
		});
		dismissed = controller
			.selected()
			.map((card) => card.id)
			.join(":");
		return true;
	} catch {
		show(m.save_failed(), true);
		return false;
	} finally {
		busy = false;
	}
}
async function buildDialogue() {
	if (!controller || busy) return;
	busy = true;
	try {
		const sources = selected.length
			? [
					...new Map(
						[
							...selected,
							...all.filter(
								(card) =>
									["hero", "elena", "cathedral"].includes(card.id) ||
									card.kind === "clue",
							),
						].map((card) => [card.id, card]),
					).values(),
				]
			: all.filter(
					(card) =>
						!card.work &&
						!card.creation &&
						card.metadataRole !== "creation-record",
				);
		const id = await controller.buildConversation(sources);
		await openWork(id);
	} catch {
		show(m.conversation_build_failed(), true);
	} finally {
		busy = false;
	}
}
async function openWork(id: string) {
	if (!controller || !mounted) return;
	const card = controller.all().find((card) => card.id === id);
	const work = readWork(card);
	if (!work) return;
	if (work.type === "scene") {
		controller.focus(id);
		inspect([id]);
		show(m.scene_body());
		return;
	}
	if (talking) return;
	notice = "";
	const fromBoard = controller.layoutRect();
	const fromCard = controller.clientRect(id);
	layoutMotion?.finish();
	controller.motion.finish();
	returnView = {
		camera: { ...controller.editor.camera },
		selection: [...controller.editor.selection],
	};
	talking = id;
	form = null;
	explore = null;
	offer = [];
	indexOpen = false;
	mobileBoard = false;
	try {
		sessionStorage.setItem(
			"neta-world:active-work",
			JSON.stringify({
				id,
				scope: connection ? connection.binding.boardId : "local",
			}),
		);
	} catch {
		show(m.run_save_failed(), true);
	}
	await tick();
	await controller.refreshView();
	if (!mounted || talking !== id) return;
	if (layoutMotion) {
		controller.animateLayout(layoutMotion, fromBoard);
		const panel = document.querySelector<HTMLElement>(".conversation");
		if (
			panel &&
			fromCard &&
			fromCard.x + fromCard.width > 0 &&
			fromCard.y + fromCard.height > 0
		)
			layoutMotion.move(panel, fromCard, 520);
	}
	controller.select([]);
	const group = `${id}-discoveries`;
	controller.editor.focusItems(
		controller.editor.document.items[group] ? [group] : [id],
		{
			padding: 55,
			maxZoom: 0.8,
		},
	);
}
async function closeTalk() {
	const leaving = talkingCard;
	const fromPanel = document
		.querySelector(".conversation")
		?.getBoundingClientRect();
	const fromBoard = controller?.layoutRect();
	layoutMotion?.finish();
	controller?.motion.finish();
	talking = null;
	mobileBoard = false;
	try {
		sessionStorage.removeItem("neta-world:active-work");
	} catch {
		show(m.run_save_failed(), true);
	}
	await tick();
	await controller?.refreshView();
	if (mounted && controller && layoutMotion && fromBoard)
		controller.animateLayout(layoutMotion, fromBoard);
	if (mounted && controller && returnView) {
		controller.select(
			returnView.selection.filter(
				(id) => controller?.editor.document.items[id],
			),
		);
		controller.editor.setCamera(returnView.camera);
	}
	if (
		mounted &&
		leaving &&
		layoutMotion &&
		fromPanel &&
		controller &&
		viewportWidth > 760
	) {
		const target = controller.clientRect(leaving.id);
		if (target) layoutMotion.portal(fromPanel, target, leaving.title);
	}
	returnView = null;
}
function foundDiscovery() {
	if (!controller || !talking || controller.editor.gestureActive) return;
	const group = `${talking}-discoveries`;
	if (controller.editor.document.items[group])
		controller.editor.focusItems([group], { padding: 50, maxZoom: 0.85 });
}
async function attachBoard(target: { spaceId: string; boardId: string }) {
	if (!controller || !mounted) return;
	const runtimeContext = await context;
	const viewer = runtimeContext?.viewer?.userUuid;
	if (!viewer) throw new Error("Sign in before connecting a Board.");
	let active = false;
	const candidate = await connectBoard(target, viewer, (state) => {
		if (!active || !controller || !mounted) return;
		syncState = state;
		if (state.document)
			controller.editor.loadDocument(state.document, target.boardId);
	});
	try {
		await candidate.start();
	} catch (error) {
		candidate.dispose();
		throw error;
	}
	if (!mounted) {
		candidate.dispose();
		return;
	}
	const local = controller.editor.document;
	draft.backup(local);
	localBeforeRemote ??= local;
	connection?.dispose();
	connection = candidate;
	active = true;
	controller.connect(
		(patch) => candidate.apply(patch),
		candidate.resolveFileUrl,
	);
	syncState = candidate.state;
	if (candidate.state.document)
		controller.editor.loadDocument(candidate.state.document, target.boardId);
	controller.fit();
	sessionStorage.setItem(
		`neta-world:binding:${viewer}`,
		JSON.stringify(target),
	);
}
async function bindRemote(create: boolean) {
	if (!controller || syncBusy) return;
	syncBusy = true;
	try {
		const targetSpace = await authorize(
			["file.view", "file.edit"],
			m.sync_permission(),
			spaceId,
		);
		let id = boardId.trim();
		if (create) {
			const result = await createCloudSave(controller.editor.document)(
				targetSpace,
			);
			id = result.id;
		}
		if (!id) throw new Error("Enter a Board ID.");
		await attachBoard({ spaceId: targetSpace, boardId: id });
		spaceId = targetSpace;
		connectOpen = false;
		show(m.sync_bound());
	} catch {
		show(runtime ? m.sync_failed() : m.sync_no_runtime(), true);
	} finally {
		syncBusy = false;
	}
}
async function disconnectRemote() {
	const runtimeContext = await context;
	if (runtimeContext?.viewer?.userUuid)
		sessionStorage.removeItem(
			`neta-world:binding:${runtimeContext.viewer.userUuid}`,
		);
	connection?.dispose();
	connection = null;
	syncState = null;
	controller?.disconnect();
	if (controller && localBeforeRemote)
		controller.editor.loadDocument(localBeforeRemote, "local");
	localBeforeRemote = null;
	controller?.fit();
}
function keydown(event: KeyboardEvent) {
	if (talking) {
		if (
			event.key === "Escape" &&
			!(event.target as HTMLElement)?.closest("input,textarea")
		)
			void closeTalk();
		return;
	}
	if (
		(event.target as HTMLElement)?.closest("input,textarea,select,button") ||
		!controller
	)
		return;
	if (event.code === "Space") {
		event.preventDefault();
		controller.editor.spaceHeld = true;
	}
	if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
		event.preventDefault();
		if (event.shiftKey) controller.editor.redo();
		else controller.editor.undo();
	}
	if (event.key === "Escape") {
		closeForm();
		dismissed = selectionKey;
		controller.editor.clearSelection();
	}
	if (event.key.toLowerCase() === "f") controller.fit();
	if (event.key.toLowerCase() === "v") setTool("select");
	if (event.key.toLowerCase() === "h") setTool("hand");
}
onMount(() => {
	mounted = true;
	layoutMotion = new MotionScope();
	const settleLayout = () => layoutMotion?.finish();
	window.addEventListener("pointerdown", settleLayout, { capture: true });
	let initial = seed();
	try {
		draft = new DraftStore(localStorage);
		initial = draft.read() ?? initial;
	} catch {
		saved = false;
		show(m.save_failed(), true);
	}
	controller = new WorldController(host, initial, {
		change: (next) => {
			if (next.hover) hoverAction = next.hover;
			else if (
				next.selected.map((card) => card.id).join(":") !==
				view?.selected.map((card) => card.id).join(":")
			)
				hoverAction = null;
			view = next;
		},
		save: persist,
		inspect,
		near: (ids) => {
			if (!busy && !form && !talking) {
				offer = ids;
				show(m.status_near());
			}
		},
		suggest: (ids) => {
			if (!busy && !form && !talking) offer = ids;
		},
		openWork: (id) => {
			void openWork(id);
		},
		error: () => show(m.boot_failed(), true),
	});
	if (saved) {
		try {
			persist(initial);
		} catch {}
	}
	try {
		const raw = sessionStorage.getItem(FORM_KEY);
		if (raw) {
			const draftForm = JSON.parse(raw);
			title = typeof draftForm.title === "string" ? draftForm.title : "";
			body = typeof draftForm.body === "string" ? draftForm.body : "";
			intent = typeof draftForm.intent === "string" ? draftForm.intent : "";
			if (kinds.includes(draftForm.kind)) kind = draftForm.kind;
			editing =
				cards(initial).find((card) => card.id === draftForm.editing) ?? null;
			if (
				["idea", "fusion", "edit"].includes(draftForm.form) &&
				(draftForm.form !== "edit" || editing)
			)
				form = draftForm.form;
			if (Array.isArray(draftForm.sources) && form)
				controller.select(
					draftForm.sources.filter(
						(id: unknown): id is string =>
							typeof id === "string" && Boolean(initial.items[id]),
					),
				);
		}
		formReady = true;
	} catch {
		show(m.save_failed(), true);
	}
	let alive = true;
	void context.then(async (value) => {
		if (!alive) return;
		runtime = Boolean(value);
		if (value?.viewer?.userUuid) {
			const rawBinding = sessionStorage.getItem(
				`neta-world:binding:${value.viewer.userUuid}`,
			);
			if (rawBinding) {
				try {
					const binding = JSON.parse(rawBinding);
					if (
						typeof binding.spaceId === "string" &&
						typeof binding.boardId === "string"
					)
						await attachBoard(binding);
				} catch {
					if (alive) show(m.sync_failed(), true);
				}
			}
		}
		if (!alive) return;
		try {
			const active = JSON.parse(
				sessionStorage.getItem("neta-world:active-work") ?? "null",
			);
			if (
				active?.scope === (connection ? connection.binding.boardId : "local") &&
				typeof active.id === "string"
			)
				await openWork(active.id);
		} catch {
			show(m.run_save_failed(), true);
		}
	});
	const storage = (event: StorageEvent) => {
		if (event.key === DRAFT_KEY) {
			saved = false;
			show(m.recovery(), true);
		}
	};
	const blur = () => {
		if (controller) controller.editor.spaceHeld = false;
	};
	const visibility = () =>
		controller?.setActive(
			!document.hidden && (!talking || mobileBoard || viewportWidth > 760),
		);
	window.addEventListener("storage", storage);
	window.addEventListener("blur", blur);
	document.addEventListener("visibilitychange", visibility);
	return () => {
		alive = false;
		mounted = false;
		request?.abort();
		connection?.dispose();
		layoutMotion?.dispose();
		window.removeEventListener("pointerdown", settleLayout, true);
		controller?.destroy();
		window.removeEventListener("storage", storage);
		window.removeEventListener("blur", blur);
		document.removeEventListener("visibilitychange", visibility);
	};
});
</script>

<svelte:window
  bind:innerWidth={viewportWidth}
  onkeydown={keydown}
  onkeyup={(e) => {
    if (e.code === 'Space' && controller) controller.editor.spaceHeld = false;
  }}
/>
<div class="app" class:dark>
  <header class="topbar">
    <button class="brand" onclick={() => controller?.fit()} aria-label="NETA World"
      ><span class="brand-mark"><Leaf size={19} strokeWidth={2.3} /></span><strong
        >NETA<span>WORLD</span></strong
      ></button
    >
    <div class="world-name"><span class="live-dot"></span>{m.world_title()}</div>
    <nav class="header-actions" aria-label={m.board_tab()}>
      <button class="icon-button" title={m.theme()} aria-label={m.theme()} onclick={toggleTheme}
        >{#if dark}<Sun size={17} />{:else}<Moon size={17} />{/if}</button
      >
      <button class="locale" onclick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
        >{m.language()}</button
      >
      <button
        class="save-button"
        aria-label={m.save_cloud()}
        disabled={cloudBusy || Boolean(connection)}
        onclick={saveCloud}
        >{#if cloudBusy}<LoaderCircle size={15} class="spin" />{:else}<ArrowUpRight
            size={15}
          />{/if}<span>{m.save_cloud()}</span></button
      >
      {#if connection}<span class="sync-status" role="status"
          >{syncState?.error
            ? m.sync_failed()
            : m.sync_pending({ count: syncState?.pending ?? 0 })}</span
        >{/if}
      <button
        class="save-button"
        disabled={syncBusy || Boolean(talking)}
        onclick={() => (connectOpen = !connectOpen)}
        >{connection ? m.sync_bound() : m.connect()}</button
      >
    </nav>
  </header>
  <div class="workspace" class:talking={Boolean(talking)} class:mobile-board={mobileBoard}>
    <aside class:mobile-open={indexOpen} inert={Boolean(talking)}>
      <div class="aside-top">
        <span class="eyebrow">NETA / 01</span><button
          class="mobile-only icon-button"
          aria-label={m.close()}
          onclick={() => (indexOpen = false)}><X size={18} /></button
        >
      </div>
      <div class="side-tabs">
        <button class:active={sideTab === 'create'} onclick={() => (sideTab = 'create')}
          >{m.creation_tab()}</button
        ><button class:active={sideTab === 'world'} onclick={() => (sideTab = 'world')}
          >{m.index_tab()} · {all.length}</button
        >
      </div>
      {#if sideTab === 'create'}
        <CreationPanel
          {selected}
          {records}
          {busy}
          onCreate={createFromPrompt}
          onError={(message) => show(message, true)}
          onConversation={buildDialogue}
          onLocate={(id) => {
            controller?.focus(id);
            indexOpen = false;
          }}
        />
      {:else}
        <WorldCatalog
          cards={all}
          {selected}
          {busy}
          onSelect={selectCard}
          onAdd={startIdea}
          onFuse={startFusion}
        />
      {/if}
      <footer class="aside-footer">
        <div class="save-state" class:failed={!saved}>
          {#if saved}<Check size={13} />{:else}<CircleHelp size={13} />{/if}{saved
            ? m.saved()
            : m.local()}
        </div>
        <p>{m.draft_note()}</p>
        <div class="file-actions">
          <button onclick={exportBoard}><ArrowDownToLine size={14} />{m.export_board()}</button
          ><button disabled={Boolean(connection) || Boolean(talking)} onclick={() => upload.click()}
            ><ArrowUpFromLine size={14} />{m.import_board()}</button
          >
        </div>
      </footer>
    </aside>
    {#if talkingCard && controller}
      {#key talkingCard.id}<ConversationPanel
          work={talkingCard}
          {controller}
          scope={connection ? connection.scope : 'local'}
          onClose={() => {
            void closeTalk();
          }}
          onDiscover={foundDiscovery}
          onError={(message) => show(message, true)}
          onToggleBoard={() => (mobileBoard = true)}
        />{/key}
    {/if}
    <main class="board-area" inert={indexOpen && viewportWidth <= 760}>
      <div class="board-top">
        <div class="segmented">
          <button class:active={!indexOpen} onclick={() => (indexOpen = false)}
            ><Layers size={14} />{m.board_tab()}</button
          ><button
            class="mobile-only"
            class:active={indexOpen}
            onclick={() => {
              sideTab = 'world';
              indexOpen = !indexOpen;
            }}>{m.index_tab()} · {all.length}</button
          >
        </div>
        {#if talking}<button
            class="mobile-only dialogue-switch"
            onclick={() => (mobileBoard = false)}>{m.open_dialogue()} ←</button
          >{:else}<span class="board-caption">{m.app_subtitle()}</span>{/if}<button
          class="icon-button"
          title={paused ? m.resume() : m.pause()}
          aria-label={paused ? m.resume() : m.pause()}
          onclick={togglePause}
          >{#if paused}<Play size={16} />{:else}<Pause size={16} />{/if}</button
        >
      </div>
      <div class="canvas-host" bind:this={host}></div>
      {#if actionCard && actionPosition && !panel && !form && !talking && !view?.gesture}
        <div
          class="card-actions"
          style:left={viewportWidth > 760 ? `${actionPosition.x}px` : undefined}
          style:top={viewportWidth > 760 ? `${actionPosition.y + 52}px` : undefined}
        >
          {#if readWork(actionCard)?.type === 'conversation'}<button
              onclick={() => {
                void openWork(actionCard.id);
              }}><MessageCircle size={14} />{m.open_dialogue()}</button
            >{:else}<button onclick={() => inspect([actionCard.id])}
              ><Sparkles size={14} />{m.think()}</button
            >{/if}
          <button
            aria-label={m.edit_card()}
            onclick={() => {
              controller?.select([actionCard.id]);
              startEdit();
            }}><SquarePen size={14} /></button
          >
        </div>
      {/if}
      {#if chosen?.work?.type === 'scene' && panel}<div class="scene-definition">
          <span class="eyebrow">{m.scene_cast()}</span>
          <p>
            {all
              .filter(
                (card) => chosen?.work?.type === 'scene' && chosen.work.cast.includes(card.id),
              )
              .map((card) => card.title)
              .join(' · ')}
          </p>
        </div>{/if}
      {#if panel && chosen}
        {#key selectionKey}<ThoughtPanel
            {selected}
            {suggestions}
            {words}
            position={viewportWidth > 760 && placement ? placement.position : null}
            {busy}
            onClose={() => (dismissed = selectionKey)}
            onAccept={accept}
            onEdit={startEdit}
            onCompose={startFusion}
            onConversation={buildDialogue}
            source={thoughtOrigin}
            onRead={(ids) => controller?.highlight(ids)}
          />{/key}
      {/if}
      {#if form}<ComposePanel
          {form}
          bind:title
          bind:body
          bind:kind
          bind:intent
          {busy}
          {ai}
          {selected}
          onClose={closeForm}
          onIdea={addIdea}
          onFuse={fuse}
          onToggleAI={enableAI}
        />{/if}
      {#if offer.length && !form && !panel && !talking}<div class="offer">
          <span>{m.status_offer()}</span><button
            onclick={() => {
              inspect(offer);
              offer = [];
            }}>{m.offer()}<ArrowUpRight size={14} /></button
          ><button class="icon-button" aria-label={m.dismiss()} onclick={() => (offer = [])}
            ><X size={14} /></button
          >
        </div>{/if}
      <BoardToolbar
        {controller}
        {view}
        {tool}
        {busy}
        mobile={viewportWidth <= 760}
        onTool={setTool}
        onAdd={startIdea}
      />
    </main>
  </div>
  {#if connectOpen}<ConnectionPanel
      {connection}
      state={syncState}
      bind:boardId
      busy={syncBusy}
      onClose={() => (connectOpen = false)}
      onBind={bindRemote}
      onLeave={() => {
        void disconnectRemote();
        connectOpen = false;
      }}
    />{/if}
  {#if notice}<div class="notice" class:error role="status">
      <span>{notice}</span><button
        class="icon-button"
        aria-label={m.close()}
        onclick={() => (notice = '')}><X size={15} /></button
      >
    </div>{/if}
  <input
    class="file-input"
    type="file"
    accept=".json,.board"
    bind:this={upload}
    onchange={importBoard}
  />
</div>
