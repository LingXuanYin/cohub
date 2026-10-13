<script lang="ts">
import { Expand, Hand, MousePointer2, Plus, Redo2, Undo2 } from "lucide-svelte";
import type { WorldController, WorldView } from "./controller";
import * as m from "./paraglide/messages.js";
const {
	controller,
	view,
	tool,
	busy,
	mobile,
	onTool,
	onAdd,
}: {
	controller: WorldController | null;
	view: WorldView | null;
	tool: "select" | "hand";
	busy: boolean;
	mobile: boolean;
	onTool(tool: "select" | "hand"): void;
	onAdd(): void;
} = $props();
</script>

<div class="board-bottom">
  <div class="tools">
    <button
      class:active={tool === 'select'}
      aria-label={m.select()}
      title={m.select()}
      onclick={() => onTool('select')}><MousePointer2 size={17} /></button
    ><button
      class:active={tool === 'hand'}
      aria-label={m.pan()}
      title={m.pan()}
      onclick={() => onTool('hand')}><Hand size={17} /></button
    ><i></i><button
      disabled={!view?.canUndo}
      aria-label={m.undo()}
      title={m.undo()}
      onclick={() => controller?.editor.undo()}><Undo2 size={17} /></button
    ><button
      disabled={!view?.canRedo}
      aria-label={m.redo()}
      title={m.redo()}
      onclick={() => controller?.editor.redo()}><Redo2 size={17} /></button
    ><i></i><button aria-label={m.fit()} title={m.fit()} onclick={() => controller?.fit()}
      ><Expand size={17} /></button
    ><span>{Math.round((view?.zoom ?? 1) * 100)}%</span>
  </div>
  <p>{mobile ? m.mobile_help() : m.help()}</p>
  <button class="mobile-only mobile-add" disabled={busy} aria-label={m.add()} onclick={onAdd}
    ><Plus size={20} /></button
  >
</div>
