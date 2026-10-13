<script lang="ts">
import { ArrowUpRight, X } from "lucide-svelte";
import type { BoardReplicaState } from "@neta-art/cohub/board/replica";
import type { BoardConnection } from "./sync";
import * as m from "./paraglide/messages.js";
let {
	connection,
	state,
	boardId = $bindable(""),
	busy,
	onClose,
	onBind,
	onLeave,
}: {
	connection: BoardConnection | null;
	state: BoardReplicaState | null;
	boardId: string;
	busy: boolean;
	onClose(): void;
	onBind(create: boolean): void;
	onLeave(): void;
} = $props();
</script>

<section class="connect-panel" aria-label={m.connect()}>
  <header>
    <h2>{m.connect()}</h2>
    <button class="icon-button" aria-label={m.close()} onclick={onClose}><X size={17} /></button>
  </header>
  {#if connection}<p>{connection.binding.boardId}</p>
    <p>{state?.error ? m.sync_failed() : m.sync_pending({ count: state?.pending ?? 0 })}</p>
    <button class="primary" onclick={() => connection.retry()}>{m.dialogue_retry()}</button><button
      class="write-own"
      onclick={onLeave}>{m.sync_leave()}</button
    >
  {:else}<p class="quiet">{m.sync_no_runtime()}</p>
    <button class="primary" disabled={busy} onclick={() => onBind(true)}
      >{busy ? m.open_pending() : m.sync_connect()}</button
    ><label>{m.sync_board_id()}<input bind:value={boardId} /></label><button
      class="write-own"
      disabled={busy || !boardId.trim()}
      onclick={() => onBind(false)}>{m.sync_open()}<ArrowUpRight size={14} /></button
    >{/if}
</section>
