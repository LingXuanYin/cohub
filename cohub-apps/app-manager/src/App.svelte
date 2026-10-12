<script lang="ts">
import { onDestroy } from "svelte";
import type { AppVersionRecord, AppViewStatsResponse } from "@neta-art/cohub";
import { client } from "../../shared/src/client";
import { message } from "../../shared/src/i18n";
import type { ViewProps } from "../../shared/src/view-types";
let {
  spaceId,
  detail,
  locale,
  busy,
  draft,
  action,
  updateDraft,
  refresh,
}: ViewProps = $props();
const t = (key: Parameters<typeof message>[1]) => message(locale, key);
const app = $derived(detail?.kind === "app" ? detail.data : null);
let slug = $state("");
let visibility = $state<"public" | "space">("space");
let status = $state<"published" | "disabled">("published");
let targetRef = $state("");
let initialized = false;
let deleted = $state(false);
let versions = $state<AppVersionRecord[]>([]);
let versionsLoaded = $state(false);
let stats = $state<AppViewStatsResponse | null>(null);
let disposed = false;
$effect(() => {
  if (!app || (initialized && (draft !== null || busy))) return;
  initialized = true;
  const source = draft ?? app;
  slug = typeof source.slug === "string" ? source.slug : app.slug;
  targetRef =
    typeof source.targetRef === "string" ? source.targetRef : app.targetRef;
  visibility = source.visibility === "public" ? "public" : "space";
  status = source.status === "disabled" ? "disabled" : "published";
});
function changed() {
  updateDraft({ slug, visibility, status, targetRef });
}
async function save(event: SubmitEvent) {
  event.preventDefault();
  if (!app) return;
  await action(["app.manage"], async () => {
    await client.apps.update(app.id, {
      slug: slug.trim(),
      targetRef: targetRef.trim(),
      visibility,
      status,
    });
    updateDraft(null);
    await refresh();
  });
}
async function loadVersions() {
  if (!app || versionsLoaded) return;
  await action(
    ["space.view"],
    async () => {
      const result = await client.apps.listVersions(app.id);
      if (!disposed) {
        versions = result.versions;
        versionsLoaded = true;
      }
    },
    false,
  );
}
async function publish() {
  if (!app) return;
  await action(["app.manage"], async () => {
    await client.apps.publishVersion(app.id);
    versionsLoaded = false;
    await refresh();
  });
}
async function remove() {
  if (!app || !confirm(t("confirm_delete"))) return;
  await action(["app.manage"], async () => {
    await client.apps.delete(app.id);
    updateDraft(null);
    deleted = true;
  });
}
async function loadStats() {
  if (!app) return;
  await action(
    ["app.manage"],
    async () => {
      const result = await client.apps.getStats(app.id);
      if (!disposed) stats = result;
    },
    false,
  );
}
onDestroy(() => {
  disposed = true;
});
</script>
<section class="content">
{#if deleted}<p>{t("deleted")}</p>
{:else if app}
	<div class="heading"><h1>{app.meta?.title ?? app.slug}</h1><button onclick={() => client.navigation.open({ kind: "app", ref: app.id })}>{t("open")} ↗</button></div>
	<p class="meta"><code>{app.id}</code><span>v{app.latestVersion}</span></p>
	<form onsubmit={save} oninput={changed} onchange={changed}>
		<fieldset disabled={busy}>
		<label>{t("slug")}<input required maxlength="100" bind:value={slug} /></label>
		<label>{t("target")}<input required bind:value={targetRef} /></label>
		<div class="columns"><label>{t("visibility")}<select bind:value={visibility}><option value="space">{t("space")}</option><option value="public">{t("public")}</option></select></label><label>{t("status")}<select bind:value={status}><option value="published">{t("published")}</option><option value="disabled">{t("disabled")}</option></select></label></div>
		<div class="toolbar"><button class="primary" disabled={busy}>{t("save")}</button><button type="button" disabled={busy || draft !== null} onclick={publish}>{t("publish")}</button><button type="button" disabled={busy} onclick={remove}>{t("delete")}</button></div>
		</fieldset>
	</form>
	<details ontoggle={(event) => { if (event.currentTarget.open) void loadVersions(); }}><summary>{t("versions")}</summary>
		{#each versions as version (version.id)}<div class="row"><span>v{version.version}</span><time class="meta">{version.createdAt ? new Date(version.createdAt).toLocaleString(locale) : "—"}</time>{#if version.source?.session}<button onclick={() => client.navigation.open({ kind: "session", spaceId, sessionId: version.source!.session!.id })}>{t("open")} ↗</button>{/if}</div>{/each}
	</details>
	<details ontoggle={(event) => { if (event.currentTarget.open && !stats) void loadStats(); }}>
		<summary>{t("views")}</summary>
		{#if stats?.summary}
			<div class="rows">
				<div class="row"><span>{t("views_total")}</span><span class="meta">{stats.summary.totalViews.toLocaleString(locale)}</span></div>
				<div class="row"><span>{t("views_24h")}</span><span class="meta">{stats.summary.views24h.toLocaleString(locale)}</span></div>
				<div class="row"><span>{t("views_7d")}</span><span class="meta">{stats.summary.views7d.toLocaleString(locale)}</span></div>
			</div>
		{/if}
	</details>
{/if}
</section>
