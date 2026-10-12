<script lang="ts">
import { onDestroy, untrack } from "svelte";
import type {
  CheckpointDiffSummary,
  CheckpointDiffFileResponse,
  SpaceFsTreeResponse,
  SpaceFsFileResponse,
} from "@neta-art/cohub";
import { isUuid } from "@cohub/protocol";
import { client } from "../../shared/src/client";
import { message } from "../../shared/src/i18n";
import type { ViewProps } from "../../shared/src/view-types";
let {
  target,
  spaceId,
  detail,
  locale,
  busy,
  draft,
  action,
  updateDraft,
  openDetail,
  navigateRelated,
}: ViewProps = $props();
const t = (key: Parameters<typeof message>[1]) => message(locale, key);
const checkpoint = $derived(detail?.kind === "checkpoint" ? detail.data : null);
let createdTaskId = $state<string | null>(null);
let disposed = false;
let description = $state(
  untrack(() =>
    typeof draft?.description === "string" ? draft.description : "",
  ),
);
let base = $state(untrack(() => target.base ?? ""));
let mode = $state<"changes" | "files">("changes");
let summary = $state<CheckpointDiffSummary | null>(null);
let tree = $state<SpaceFsTreeResponse | null>(null);
let patch = $state<CheckpointDiffFileResponse | null>(null);
let file = $state<SpaceFsFileResponse | null>(null);
let path = $state("");
let loading = $state(false);
let error = $state(false);
let sequence = 0;
const api = $derived(client.space(spaceId).checkpoints(target.id));
async function load() {
  const request = ++sequence;
  loading = true;
  error = false;
  patch = null;
  file = null;
  try {
    if (mode === "changes") {
      if (base && !isUuid(base)) throw new Error("Invalid checkpoint id");
      const next = await api.diff.summary({ base: base || null });
      if (request === sequence) summary = next;
    } else {
      const next = await api.files.list(path);
      if (request === sequence) tree = next;
    }
  } catch {
    if (request === sequence) error = true;
  } finally {
    if (request === sequence) loading = false;
  }
}
async function compare(event: SubmitEvent) {
  event.preventDefault();
  if (base && !isUuid(base)) {
    error = true;
    return;
  }
  openDetail(target.id, base || undefined);
}
async function openFile(filePath: string) {
  const request = ++sequence;
  loading = true;
  error = false;
  patch = null;
  file = null;
  try {
    if (mode === "changes") {
      const next = await api.diff.file(filePath, { base: base || null });
      if (request === sequence) patch = next;
    } else {
      const next = await api.files.read(filePath);
      if (next.kind === "text" && next.delivery === "url" && next.url) {
        const response = await fetch(next.url);
        if (!response.ok) throw new Error("Failed to read snapshot file");
        next.content = await response.text();
      }
      if (request === sequence) file = next;
    }
  } catch {
    if (request === sequence) error = true;
  } finally {
    if (request === sequence) loading = false;
  }
}
let initialized = false;
$effect(() => {
  if (checkpoint && !initialized) {
    initialized = true;
    void load();
  }
});
onDestroy(() => {
  disposed = true;
  sequence += 1;
});
async function create(event: SubmitEvent) {
  event.preventDefault();
  if (createdTaskId) return;
  const saved = await action(["checkpoint.edit"], async () => {
    const result = await client.space(spaceId).checkpoints.create(description);
    updateDraft(null);
    if (!disposed) createdTaskId = result.taskRunId;
  });
  if (saved && createdTaskId && !disposed)
    await navigateRelated({ kind: "task", spaceId, taskRunId: createdTaskId });
}
</script>
<section class="content">
{#if target.id === "new"}
	<h1>{t("create")} · {t("checkpoint")}</h1>
	{#if createdTaskId}
    <p role="status">{t("checkpoint_started")}</p>
    <button onclick={() => navigateRelated({ kind: "task", spaceId, taskRunId: createdTaskId! })}>{t("task")} ↗</button>
  {:else}
	<form onsubmit={create} oninput={() => updateDraft({ description })}>
		<fieldset disabled={busy}>
			<label>{t("description")}<textarea rows="5" bind:value={description}></textarea></label>
			<button class="primary" disabled={busy}>{t("create")}</button>
		</fieldset>
	</form>
  {/if}
{:else if checkpoint}
	<h1>{checkpoint.description || t("checkpoint")}</h1>
	<p class="meta"><code>{checkpoint.id}</code><time>{new Date(checkpoint.createdAt).toLocaleString(locale)}</time></p>
	<p class="eyebrow">{t("readonly")}</p>
	<div class="toolbar sections"><button class:active={mode === "changes"} onclick={() => { mode = "changes"; void load(); }}>{t("changes")}</button><button class:active={mode === "files"} onclick={() => { mode = "files"; void load(); }}>{t("files")}</button></div>
	{#if mode === "changes"}
		<form class="inline" onsubmit={compare}><label>{t("base")}<input bind:value={base} placeholder={t("parent")} /></label><button>{t("open")}</button></form>
		{#if summary}<p class="meta">{summary.stats.changedFileCount} · <span class="added">+{summary.stats.additions}</span><span class="removed">−{summary.stats.deletions}</span></p>
			{#if summary.truncated}<p role="status">{t("truncated")}</p>{/if}
			<div class="rows">{#each summary.files as item (item.path)}<button class="row" onclick={() => openFile(item.path)}><span class="badge">{item.status}</span><span class="truncate">{item.path}</span><span class="meta">+{item.additions ?? 0} −{item.deletions ?? 0}</span></button>{:else}<p>{t("no_changes")}</p>{/each}</div>
		{/if}
	{:else}
		<div class="toolbar">{#if path}<button onclick={() => { path = path.split("/").slice(0, -1).join("/"); void load(); }}>← {t("back")}</button>{/if}<code>{path || "/"}</code></div>
		<div class="rows">{#each tree?.entries ?? [] as entry (entry.path)}<button class="row" onclick={() => { if (entry.type === "dir") { path = entry.path; void load(); } else void openFile(entry.path); }}><span>{entry.type === "dir" ? "▸" : "·"}</span><span class="truncate">{entry.name}</span></button>{/each}</div>
	{/if}
	{#if loading}<p role="status">{t("loading")}</p>{/if}
	{#if error}<p class="notice" role="alert">{t("error")}</p>{/if}
	{#if patch}<h2>{patch.path}</h2>{#if patch.kind === "text"}<pre class="diff">{#each patch.lines as line}<span class:added={line.type === "add"} class:removed={line.type === "del"}>{line.text}{"\n"}</span>{/each}</pre>{:else}<p>{t("binary")}</p>{/if}{#if patch.truncated}<p>{t("truncated")}</p>{/if}{/if}
	{#if file}<h2>{file.name}</h2>{#if file.kind === "text"}<pre>{file.content}</pre>{:else}<p>{t("binary")}</p>{#if file.url}<a href={file.url} target="_blank" rel="noopener noreferrer">{t("download")}</a>{/if}{/if}{/if}
{/if}
</section>
