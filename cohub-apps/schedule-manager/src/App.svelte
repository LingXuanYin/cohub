<script lang="ts">
import { onDestroy, untrack } from "svelte";
import type { TaskRunRecord } from "@neta-art/cohub";
import { client } from "../../shared/src/client";
import { message } from "../../shared/src/i18n";
import { record, replacePrompt } from "../../shared/src/state";
import type { ViewProps } from "../../shared/src/view-types";
import Json from "../../shared/src/Json.svelte";
let {
  target,
  spaceId,
  detail,
  locale,
  busy,
  draft,
  action,
  authorize,
  openDetail,
  navigateRelated,
  updateDraft,
  refresh,
}: ViewProps = $props();
const t = (key: Parameters<typeof message>[1]) => message(locale, key);
const job = $derived(detail?.kind === "cronjob" ? detail.data : null);
const textBlocks = $derived(
  Array.isArray(job?.payload.content)
    ? job.payload.content.map(record).filter((block) => block.type === "text")
    : [],
);
const originalPrompt = $derived(
  textBlocks.map((block) => block.text ?? "").join("\n"),
);
const promptEditable = $derived(
  !job || (job.taskType === "send_message" && textBlocks.length <= 1),
);
let title = $state("");
let expression = $state("0 9 * * *");
let timezone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone);
let prompt = $state("");
let enabled = $state(true);
let initialized = false;
let deleted = $state(false);
let runs = $state<TaskRunRecord[]>([]);
let cursor = $state<string | null>(null);
let runsOpen = $state(false);
let runsLoading = $state(false);
let runsError = $state(false);
let disposed = false;
$effect(() => {
  if (
    (!job && target.id !== "new") ||
    (initialized && (draft !== null || busy))
  )
    return;
  initialized = true;
  const source = draft ?? job;
  title = typeof source?.title === "string" ? source.title : "";
  expression =
    typeof source?.cronExpression === "string"
      ? source.cronExpression
      : "0 9 * * *";
  timezone =
    typeof source?.timezone === "string"
      ? source.timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone;
  enabled = typeof source?.enabled === "boolean" ? source.enabled : true;
  const content = record(job?.payload).content;
  prompt =
    typeof draft?.prompt === "string"
      ? draft.prompt
      : Array.isArray(content)
        ? content
            .map(record)
            .filter((block) => block.type === "text")
            .map((block) => block.text ?? "")
            .join("\n")
        : "";
});
function changed() {
  updateDraft({ title, cronExpression: expression, timezone, prompt, enabled });
}
async function save(event: SubmitEvent) {
  event.preventDefault();
  const creating = target.id === "new";
  let createdId: string | null = null;
  const saved = await action(
    creating
      ? ["cronjob.manage", "session.prompt.fullaccess"]
      : ["cronjob.manage"],
    async () => {
      if (creating) {
        const result = await client.space(spaceId).prompt({
          title: title.trim(),
          content: [{ type: "text", text: prompt }],
          schedule: {
            mode: "repeat",
            cronExpression: expression.trim(),
            timezone,
          },
        });
        if (result.mode !== "repeat")
          throw new Error("Expected a scheduled prompt");
        updateDraft(null);
        createdId = result.cronJobId;
      } else if (job) {
        await client.cronJobs.update(job.id, {
          title: title.trim(),
          cronExpression: expression.trim(),
          timezone,
          enabled,
          ...(promptEditable && prompt !== originalPrompt
            ? { payload: replacePrompt(job.payload, prompt) }
            : {}),
        });
        updateDraft(null);
        await refresh();
      }
    },
  );
  if (saved && createdId && !disposed) {
    openDetail(createdId);
  }
}
$effect(() => {
  if (job && runsOpen) untrack(() => void loadRuns(true));
});
async function loadRuns(reset = false) {
  if (!job || runsLoading) return;
  runsLoading = true;
  runsError = false;
  try {
    const granted = await authorize(["taskrun.view"]);
    if (disposed || !job) return;
    if (!granted) {
      runsError = true;
      return;
    }
    const result = await client.cronJobs.runs(job.id, {
      limit: 20,
      cursor: reset ? null : cursor,
    });
    if (disposed) return;
    runs = [
      ...new Map(
        [...(reset ? [] : runs), ...result.runs].map((run) => [run.id, run]),
      ).values(),
    ];
    cursor = result.pageInfo.hasMore ? result.pageInfo.nextCursor : null;
  } catch {
    if (!disposed) runsError = true;
  } finally {
    if (!disposed) runsLoading = false;
  }
}
async function remove() {
  if (!job || !confirm(t("confirm_delete"))) return;
  await action(["cronjob.manage"], async () => {
    await client.cronJobs.delete(job.id);
    updateDraft(null);
    deleted = true;
  });
}
onDestroy(() => {
  disposed = true;
});
</script>
<section class="content">
{#if deleted}<p>{t("deleted")}</p>
{:else if job || target.id === "new"}
	<h1>{job?.title ?? `${t("create")} · ${t("cronjob")}`}</h1>
	{#if job}<p class="meta"><code>{job.id}</code></p>{/if}
	<form onsubmit={save} oninput={changed} onchange={changed}>
		<fieldset disabled={busy}>
		<label>{t("title")}<input required maxlength="200" bind:value={title} /></label>
		<div class="columns"><label>{t("schedule")}<input required bind:value={expression} /></label><label>{t("timezone")}<input required bind:value={timezone} /></label></div>
		{#if promptEditable}<label>{t("prompt")}<textarea required rows="8" bind:value={prompt}></textarea></label>{:else}<details><summary>{t("input")}</summary><Json value={job?.payload} /></details>{/if}
		{#if job}<label class="check"><input type="checkbox" bind:checked={enabled} />{t("enabled")}</label>{/if}
		<div class="toolbar"><button class="primary" disabled={busy}>{t(job ? "save" : "create")}</button>{#if job}<button type="button" disabled={busy} onclick={remove}>{t("delete")}</button>{/if}</div>
		</fieldset>
	</form>
	{#if job}<details ontoggle={(event) => { runsOpen = event.currentTarget.open; }}><summary>{t("runs")}</summary>
		{#if runsError}<p class="notice">{t("error")}</p><button onclick={() => loadRuns(true)}>{t("retry")}</button>{/if}
		{#each runs as run (run.id)}<button class="row" onclick={() => navigateRelated({ kind: "task", spaceId, taskRunId: run.id })}><time>{new Date(run.createdAt).toLocaleString(locale)}</time><span class="status" data-status={run.status}>{t(run.status)}</span></button>{/each}
		{#if runsLoading}<p>{t("loading")}</p>{:else if cursor}<button onclick={() => loadRuns()}>{t("more")}</button>{/if}
	</details>{/if}
{/if}
</section>
