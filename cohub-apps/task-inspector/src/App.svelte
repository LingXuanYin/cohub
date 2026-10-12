<script lang="ts">
import { message } from "../../shared/src/i18n";
import { record } from "../../shared/src/state";
import type { ViewProps } from "../../shared/src/view-types";
import Json from "../../shared/src/Json.svelte";
let { detail, locale, spaceId, navigateRelated }: ViewProps = $props();
const t = (key: Parameters<typeof message>[1]) => message(locale, key);
const run = $derived(detail?.kind === "task" ? detail.data.run : null);
const progress = $derived(
  detail?.kind === "task" ? detail.data.progress : null,
);
const result = $derived(record(run?.result));
const checkpointId = $derived(
  typeof result.checkpointId === "string" ? result.checkpointId : null,
);
const blocks = $derived.by(() => {
  const output = record(result.output);
  const values =
    result.content ??
    (Array.isArray(result.output) ? result.output : output.content) ??
    result.outputs;
  return Array.isArray(values) ? values.map(record) : [];
});
function source(block: Record<string, unknown>) {
  const media = record(block.source);
  const value = media.url ?? media.src ?? block.url ?? block.src;
  if (typeof value !== "string") {
    const data =
      media.data ??
      media.base64 ??
      media.contentBase64 ??
      block.data ??
      block.base64 ??
      block.contentBase64;
    const mime = media.mediaType ?? media.mimeType ?? block.mediaType;
    if (typeof data !== "string" || !/^[a-zA-Z0-9+/=\r\n]+$/.test(data))
      return null;
    const fallback =
      block.type === "audio"
        ? "audio/mpeg"
        : block.type === "video"
          ? "video/mp4"
          : "image/png";
    const safeMime =
      typeof mime === "string" &&
      /^(image|audio|video)\/[a-zA-Z0-9.+-]+$/.test(mime)
        ? mime
        : fallback;
    return `data:${safeMime};base64,${data}`;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
</script>
{#if run}
<section class="content">
	<div class="heading"><h1>{run.taskType}</h1><span class="status" data-status={run.status}>{t(run.status)}</span></div>
	<p class="meta"><code>{run.id}</code><time>{new Date(run.createdAt).toLocaleString(locale)}</time></p>
	{#if checkpointId && spaceId}<button onclick={() => navigateRelated({ kind: "checkpoint", spaceId, checkpointId: checkpointId! })}>{t("checkpoint")} ↗</button>{/if}
	{#if run.cronJobId && spaceId}<button onclick={() => navigateRelated({ kind: "cronjob", spaceId, cronjobId: run.cronJobId! })}>{t("cronjob")} ↗</button>{/if}
	{#if run.errorMessage}<p class="notice">{run.errorMessage}</p>{/if}
	{#if progress}<section><h2>{t("progress")}</h2><Json value={progress} /></section>{/if}
	{#if run.result !== null}
	<section><h2>{t("output")}</h2>
		{#each blocks as block}
			{@const url = source(block)}
			{#if block.type === "image" && url}<img class="output-media" src={url} alt="" loading="lazy" />
			{:else if block.type === "video" && url}<video class="output-media" src={url} controls preload="metadata"><track kind="captions" /></video>
			{:else if block.type === "audio" && url}<audio src={url} controls preload="metadata"></audio>
			{:else if block.type === "text" && typeof block.text === "string"}<pre>{block.text}</pre>{/if}
		{/each}
		<details open={blocks.length === 0}><summary>{t("details")}</summary><Json value={run.result} /></details>
	</section>{/if}
	<details><summary>{t("input")}</summary><Json value={run.payload} /></details>
</section>
{/if}
