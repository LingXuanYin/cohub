<script lang="ts">
import { LoaderCircle, Plus, Sparkles, X } from "lucide-svelte";
import { kindLabel, kinds, type Card, type Kind } from "./world";
import * as m from "./paraglide/messages.js";
let {
	form,
	title = $bindable(""),
	body = $bindable(""),
	kind = $bindable<Kind>("idea"),
	intent = $bindable(""),
	busy,
	ai,
	selected,
	onClose,
	onIdea,
	onFuse,
	onToggleAI,
}: {
	form: "idea" | "edit" | "fusion";
	title: string;
	body: string;
	kind: Kind;
	intent: string;
	busy: boolean;
	ai: boolean;
	selected: Card[];
	onClose(): void;
	onIdea(event: SubmitEvent): void;
	onFuse(event: SubmitEvent): void;
	onToggleAI(): void;
} = $props();
</script>

<section
  class="compose-panel"
  aria-label={form === 'fusion'
    ? m.fusion_title()
    : form === 'edit'
      ? m.edit_card()
      : m.new_title()}
>
  <header>
    <div>
      <span class="eyebrow">{form === 'idea' ? m.card_idea() : m.sources()}</span>
      <h2>
        {form === 'fusion' ? m.fusion_title() : form === 'edit' ? m.edit_card() : m.new_title()}
      </h2>
    </div>
    <button class="icon-button" aria-label={m.close()} onclick={onClose}><X size={19} /></button>
  </header>
  {#if form !== 'fusion'}<form onsubmit={onIdea}>
      <label
        >{m.kind_label()}<select bind:value={kind}
          >{#each kinds as k}<option value={k}>{kindLabel(k)}</option>{/each}</select
        ></label
      ><label
        >{m.title_label()}<input
          bind:value={title}
          maxlength="100"
          placeholder={m.title_placeholder()}
          required
        /></label
      ><label
        >{m.body_label()}<textarea
          bind:value={body}
          rows="5"
          placeholder={m.body_placeholder()}
          required></textarea></label
      ><button class="primary" disabled={busy}
        >{#if busy}<LoaderCircle size={16} class="spin" />{:else}<Plus size={16} />{/if}{form ===
        'edit'
          ? m.save_changes()
          : m.create()}</button
      >
    </form>
  {:else}<form onsubmit={onFuse}>
      <div class="source-chips">
        {#each selected as card}<span>{card.title}</span>{/each}
      </div>
      <p class="quiet">{m.fusion_hint()}</p>
      <label
        >{m.intent()}<textarea
          bind:value={intent}
          rows="4"
          placeholder={m.intent_placeholder()}
          disabled={busy}></textarea></label
      ><button
        class="ai-toggle"
        type="button"
        aria-pressed={ai}
        disabled={busy}
        onclick={onToggleAI}
        ><span class:enabled={ai}></span>{ai ? m.ai_mode() : m.draft_mode()}<span
          >{ai ? '✓' : '+'}</span
        ></button
      >
      <p class="quiet ai-hint">{m.ai_hint()}</p>
      <button class="primary" disabled={busy || !selected.length}
        >{#if busy}<LoaderCircle size={16} class="spin" />{:else}<Sparkles size={16} />{/if}{busy
          ? m.creating()
          : m.create()}</button
      >
    </form>{/if}
</section>
