<script lang="ts">
import { ChevronRight, Plus, Sparkles } from "lucide-svelte";
import { kindLabel, type Card } from "./world";
import * as m from "./paraglide/messages.js";
const {
	cards,
	selected,
	busy,
	onSelect,
	onAdd,
	onFuse,
}: {
	cards: Card[];
	selected: Card[];
	busy: boolean;
	onSelect(id: string, additive?: boolean): void;
	onAdd(): void;
	onFuse(): void;
} = $props();
</script>

<button class="new-idea" disabled={busy} onclick={onAdd}
  ><Plus size={17} />{m.add()}<span>↗</span></button
>
<div class="catalog-heading">
  <span>{m.index_tab()}</span><span>{cards.length.toString().padStart(2, '0')}</span>
</div>
<div class="catalog">
  {#each cards as card (card.id)}<div
      class="catalog-row"
      class:selected={selected.some((source) => source.id === card.id)}
    >
      <input
        type="checkbox"
        aria-label={`${m.choose_card()} · ${card.title}`}
        checked={selected.some((source) => source.id === card.id)}
        onchange={() => onSelect(card.id, true)}
      /><button onclick={() => onSelect(card.id)}
        ><i class={`kind-dot ${card.kind}`}></i><span
          >{card.title}<small>{kindLabel(card.kind)}</small></span
        ><ChevronRight size={13} /></button
      >
    </div>{/each}
</div>
{#if selected.length > 1}<button class="primary aside-fuse" disabled={busy} onclick={onFuse}
    ><Sparkles size={16} />{m.fuse()} · {selected.length}</button
  >{/if}
