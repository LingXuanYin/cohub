<script lang="ts">
import { tick, onMount, onDestroy, untrack } from "svelte";
import {
	ArrowLeft,
	ArrowDownToLine,
	ChevronRight,
	LoaderCircle,
	RotateCcw,
	Sparkles,
} from "lucide-svelte";
import { entrance } from "./motion";
import DiscoveryBeat from "./DiscoveryBeat.svelte";
import {
	advance,
	choices,
	matchChoice,
	reply,
	startRun,
	type Run,
} from "./conversation";
import { RunStore } from "./run-store";
import type { Card } from "./world";
import { WorldController } from "./controller";
import { download } from "./storage";
import { authorize, createCharacterReply } from "./cohub";
import * as m from "./paraglide/messages.js";

const {
	work,
	controller,
	scope,
	onClose,
	onDiscover,
	onError,
	onToggleBoard,
}: {
	work: Card;
	controller: WorldController;
	scope: string;
	onClose(): void;
	onDiscover(): void;
	onError(message: string): void;
	onToggleBoard(): void;
} = $props();
const store = untrack(() => new RunStore(localStorage, scope));
const sourceCards = untrack(() => {
	const ids = new Set(work.work?.sources ?? work.sources);
	return controller.all().filter((card) => ids.has(card.id));
});
let run = $state.raw<Run>(untrack(() => startRun(work.id, sourceCards)));
let beat = $state.raw<{
	id: string;
	title: string;
	from: DOMRect | null;
	to: DOMRect | null;
} | null>(null);
let busy = $state(false);
let failed = $state(false);
let writable = $state(true);
let input = $state("");
let ai = $state(false);
let space = $state<string | undefined>();
let log: HTMLDivElement;
let request: AbortController | null = null;
let alive = true;
const options = $derived(choices(run));
const discoveries = $derived(
	run.turns.reduce((sum, turn) => sum + turn.discoveries.length, 0),
);
const clueCount = $derived(
	run.sources.filter((card) => card.kind === "clue").length,
);
function restore() {
	try {
		const stored = store.read(work.id);
		if (stored) run = stored;
		else store.save(run, null);
	} catch {
		writable = false;
		onError(m.run_save_failed());
	}
}
$effect(() => {
	const turns = run.turns.length;
	void tick().then(() => {
		if (alive && log && turns)
			log.scrollTo({ top: log.scrollHeight, behavior: "instant" });
	});
});
let inputReady = $state(false);
$effect(() => {
	if (!inputReady) return;
	try {
		sessionStorage.setItem(`neta-world:run-input:${run.id}`, input);
	} catch {
		onError(m.run_save_failed());
	}
});
onMount(() => {
	restore();
	try {
		input = sessionStorage.getItem(`neta-world:run-input:${run.id}`) ?? "";
		inputReady = true;
	} catch {
		onError(m.run_save_failed());
	}
	if (writable) void replay();
});
onDestroy(() => {
	alive = false;
	request?.abort();
});
function save(next: Run) {
	try {
		store.save(next, run);
		run = next;
	} catch {
		run = next;
		writable = false;
		onError(m.run_conflict());
		throw new Error("Conversation storage failed.");
	}
}
async function replay() {
	if (busy || !writable || !alive) return;
	busy = true;
	failed = false;
	try {
		let changed = false;
		for (const turn of run.turns) {
			if (!alive) break;
			if (run.applied.includes(turn.id)) continue;
			const ids = await controller.applyTurn(run, turn);
			changed ||= turn.discoveries.length > 0;
			if (alive && ids.length) {
				await tick();
				const source = log.querySelector<HTMLElement>(
					`[data-turn-id="${CSS.escape(turn.id)}"]`,
				);
				beat = {
					id: turn.id,
					title:
						turn.discoveries
							.filter((event) => event.type === "card")
							.map((event) => (event.type === "card" ? event.card.title : ""))
							.join(" · ") || m.scene_title(),
					from: source?.getBoundingClientRect() ?? null,
					to: controller.layoutRect(),
				};
			}
			save({
				...run,
				applied: [...run.applied, turn.id],
				revision: run.revision + 1,
			});
		}
		if (alive && changed) onDiscover();
	} catch {
		failed = true;
		if (alive) onError(m.dialogue_failed());
	} finally {
		if (alive) busy = false;
	}
}
async function pick(id: string) {
	if (busy || failed || !writable) return;
	try {
		save(advance(run, id));
		await replay();
	} catch {
		onError(m.run_save_failed());
	}
}
async function speak(event: SubmitEvent) {
	event.preventDefault();
	const text = input.trim();
	if (!text || busy || failed || !writable || run.node === "end") return;
	const option = matchChoice(run, text);
	if (option) {
		try {
			save(advance(run, option.id, text));
			input = "";
			await replay();
		} catch {
			onError(m.run_save_failed());
		}
		return;
	}
	busy = true;
	const abort = new AbortController();
	request = abort;
	try {
		const result =
			ai && space
				? await createCharacterReply(space, run, text, abort.signal)
				: undefined;
		if (abort.signal.aborted || !alive) return;
		save(reply(run, text, result));
		input = "";
	} catch {
		if (!abort.signal.aborted && alive) onError(m.ai_failed());
	} finally {
		if (alive) {
			busy = false;
			request = null;
		}
	}
}
async function toggleAI() {
	if (ai) {
		ai = false;
		return;
	}
	try {
		space = await authorize(["session.prompt.readonly"], m.ai_permission());
		ai = true;
	} catch {
		onError(m.cloud_unavailable());
	}
}
function restart() {
	if (busy || !writable) return;
	const next = startRun(work.id, sourceCards);
	try {
		store.restart(next, run);
		run = next;
		input = "";
		failed = false;
		beat = null;
	} catch {
		writable = false;
		onError(m.run_conflict());
	}
}
function close() {
	alive = false;
	request?.abort();
	onClose();
}
</script>

<section class="conversation" aria-label={m.open_dialogue()}>
  {#if beat}{#key beat.id}<DiscoveryBeat
        title={beat.title}
        from={beat.from}
        to={beat.to}
      />{/key}{/if}
  <header class="conversation-head">
    <button class="icon-button" aria-label={m.dialogue_back()} onclick={close}
      ><ArrowLeft size={18} /></button
    >
    <div>
      <span class="eyebrow">{m.dialogue_mode()}</span>
      <h1>{work.title}</h1>
    </div>
    <button
      class="icon-button"
      aria-label={m.dialogue_export()}
      onclick={() => download(`neta-run-${run.id}.json`, JSON.stringify(run, null, 2))}
      ><ArrowDownToLine size={17} /></button
    >
  </header>
  <div
    class="conversation-stage"
    style:background-image={`linear-gradient(0deg, var(--paper), transparent), url(${new URL('art/cathedral.webp', new URL(import.meta.env.BASE_URL, location.href)).href})`}
  >
    <span>{m.dialogue_turn({ count: run.turns.length })}</span>
    <p>{m.dialogue_intro()}</p>
    <div class="source-chips">
      {#each run.sources as card}<span>{card.title}</span>{/each}
    </div>
  </div>
  <div class="conversation-status" role="status">
    <span>{m.dialogue_clues({ count: clueCount })}</span><span
      >{busy ? m.dialogue_pending() : m.discoveries_count({ count: discoveries })}</span
    ><button class="mobile-only" onclick={onToggleBoard}>{m.board_tab()} ↗</button>
  </div>
  <div class="conversation-log" bind:this={log} aria-live="polite" aria-relevant="additions">
    {#each run.turns.slice(-40) as turn (turn.id)}
      {#if turn.input}<article class="turn user" use:entrance>
          <small>{m.dialogue_you()}</small>
          <p>{turn.input}</p>
        </article>{/if}
      <article class="turn" data-turn-id={turn.id} use:entrance>
        <small>{turn.speaker}</small>
        <p>{turn.text}</p>
        {#if turn.discoveries.length}<span class="turn-receipt"
            ><Sparkles size={12} />{run.applied.includes(turn.id)
              ? m.dialogue_saved()
              : m.dialogue_pending()}</span
          >{/if}
      </article>
    {/each}
    {#if run.node === 'end'}<div class="run-end" use:entrance>
        <strong>{m.dialogue_finished()}</strong>
        <p>{m.dialogue_restart_note()}</p>
        <button onclick={restart} disabled={busy || !writable}
          ><RotateCcw size={14} />{m.dialogue_replay()}</button
        ><button onclick={close}>{m.dialogue_back()}<ChevronRight size={14} /></button>
      </div>{/if}
  </div>
  <footer class="conversation-footer">
    {#if failed}<button class="primary" disabled={busy || !writable} onclick={replay}
        >{m.dialogue_retry()}</button
      >{/if}
    {#if !writable}<button
        class="primary"
        onclick={() => download(`neta-run-${run.id}.json`, JSON.stringify(run, null, 2))}
        >{m.dialogue_export()}</button
      >{/if}
    <div class="conversation-options">
      {#each options as option, i}<button
          disabled={busy || failed || !writable}
          use:entrance={{ delay: i * 50 }}
          onclick={() => pick(option.id)}
          ><b>{i + 1}</b><span>{option.label}</span><ChevronRight size={14} /></button
        >{/each}
    </div>
    {#if run.node !== 'end'}<form onsubmit={speak}>
        <label class="sr-only" for="run-input">{m.dialogue_say()}</label><input
          id="run-input"
          bind:value={input}
          maxlength="4000"
          placeholder={m.dialogue_placeholder()}
          disabled={busy || failed || !writable}
        /><button
          type="submit"
          aria-label={m.dialogue_send()}
          disabled={!input.trim() || busy || failed || !writable}
          >{#if busy}<LoaderCircle size={16} class="spin" />{:else}<ChevronRight
              size={19}
            />{/if}</button
        >
      </form>
      <button class="conversation-ai" aria-pressed={ai} disabled={busy} onclick={toggleAI}
        >{ai ? m.run_mode_ai() : m.dialogue_mode()} · {ai ? '✓' : '+'}</button
      >{/if}
  </footer>
</section>
