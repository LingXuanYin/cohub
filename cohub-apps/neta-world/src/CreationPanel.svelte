<script lang="ts">
import { entrance } from "./motion";
import { onMount } from "svelte";
import {
	ArrowUpRight,
	LoaderCircle,
	MessageCircle,
	Plus,
	Sparkles,
} from "lucide-svelte";
import type { Card } from "./world";
import * as m from "./paraglide/messages.js";
const {
	selected,
	records,
	busy,
	onCreate,
	onConversation,
	onLocate,
	onError,
}: {
	selected: Card[];
	records: Card[];
	busy: boolean;
	onCreate(text: string): Promise<boolean>;
	onConversation(): void;
	onLocate(id: string): void;
	onError(message: string): void;
} = $props();
let input = $state("");
let ready = $state(false);
onMount(() => {
	try {
		input = sessionStorage.getItem("neta-world:creation-input") ?? "";
		ready = true;
	} catch {
		onError(m.save_failed());
	}
});
$effect(() => {
	if (ready) {
		try {
			sessionStorage.setItem("neta-world:creation-input", input);
		} catch {
			onError(m.save_failed());
		}
	}
});
async function submit(event: SubmitEvent) {
	event.preventDefault();
	const text = input.trim();
	if (text && !busy && (await onCreate(text))) input = "";
}
</script>

<div class="creation-panel">
  <div class="creation-welcome">
    <span class="eyebrow">{m.creation_new()}</span>
    <h1>{m.intro_title()}</h1>
    <p>{m.creation_empty()}</p>
  </div>
  <div class="creation-history">
    {#each records as card (card.id)}<article use:entrance>
        <span class="eyebrow">{m.creation_record()}</span>
        <h3>{card.creation?.question}</h3>
        <p>{card.creation?.explanation}</p>
        <details>
          <summary>{m.record_basis()}</summary
          >{#each card.creation?.basis ?? [] as source}<blockquote>
              <b>{source.title}</b>
              <p>{source.body}</p>
            </blockquote>{/each}<small>{m.record_explanation()}</small>
        </details>
        <button onclick={() => onLocate(card.id)}>{card.title}<ArrowUpRight size={14} /></button>
      </article>{/each}
  </div>
  <div class="creation-composer">
    <div class="source-chips">
      {#each selected as card}<span>{card.title}</span>{/each}
    </div>
    <form onsubmit={submit}>
      <label class="sr-only" for="create-input">{m.creation_input()}</label><textarea
        id="create-input"
        bind:value={input}
        maxlength="4000"
        rows="3"
        placeholder={m.creation_placeholder()}
        disabled={busy}></textarea><button class="primary" disabled={busy || !input.trim()}
        >{#if busy}<LoaderCircle size={16} class="spin" />{:else}<Plus
            size={16}
          />{/if}{m.create()}</button
      >
    </form>
    <button class="create-conversation" disabled={busy} onclick={onConversation}
      ><MessageCircle size={15} />{m.build_dialogue()}<Sparkles size={13} /></button
    >
  </div>
</div>
