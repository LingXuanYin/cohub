<script lang="ts">
import type { AppDomainListResponse, AppRecord, AppUpdateInput, AppVersionRecord, AppViewStatsResponse, PublicUserProfile } from "@neta-art/cohub";
import { BarChart3, ExternalLink, MessageSquare, PanelRight, Pencil, Power, Rocket, Trash2 } from "lucide-svelte";
import { onDestroy, onMount, untrack } from "svelte";
import { m } from "$messages";
import AppCustomDomain from "$kit/AppCustomDomain.svelte";
import AppPromotions from "$kit/AppPromotions.svelte";
import AppViewStats from "$kit/AppViewStats.svelte";
import {
  type AppDomainCache,
  type AppDomainChange,
  hidesCohubBar,
  isNewerAppSnapshot,
  parseAppDomainEvent,
  parseAppVersionPublished,
  upsertAppVersion,
  withCohubBar,
} from "$kit/app";
import { formatDateTime } from "$kit/time";
import { hasScopes } from "../../shared/src/access";
import { client, subscribeSpace, webUrl } from "../../shared/src/client";
import { getLocale, runtime } from "../../shared/src/runtime.svelte";
import { resourceTitle } from "../../shared/src/shell/title";
import { appStatus, appVisibility } from "../../shared/src/status";
import { readCache, writeCache } from "../../shared/src/storage";
import Button from "../../shared/src/ui/Button.svelte";
import { cardClass, eyebrowClass, labelClass } from "../../shared/src/ui/classes";
import CopyButton from "../../shared/src/ui/CopyButton.svelte";
import { feedback } from "../../shared/src/ui/feedback.svelte";
import type { LucideIcon } from "../../shared/src/ui/icon";
import Notice from "../../shared/src/ui/Notice.svelte";
import StatusBadge from "../../shared/src/ui/StatusBadge.svelte";
import type { ViewProps } from "../../shared/src/view-types";
import AppForm, { type AppValues } from "./AppForm.svelte";

let { spaceId, detail, busy, draft, action, authorize, updateDraft, setDetail, removed, navigateRelated }: ViewProps = $props();

const locale = $derived(getLocale());
const app = $derived(detail?.kind === "app" ? detail.data : null);
const status = $derived(app ? appStatus(app.status, locale) : null);
const visibility = $derived(app ? appVisibility(app.visibility, locale) : null);
const hiddenBar = $derived(hidesCohubBar(app?.meta));
// Hosts do not always push a new context after consent, so grants seen here count too.
let manageGranted = $state(false);
let editGranted = $state(false);
const canManage = $derived(manageGranted || hasScopes(runtime.context, spaceId, ["app.manage"]));
const canEditSpace = $derived(editGranted || hasScopes(runtime.context, spaceId, ["space.edit"]));
let editing = $state(untrack(() => draft !== null));
let publicUrl = $state<string | null>(null);
let publisher = $state<PublicUserProfile | null>(null);
let versions = $state<AppVersionRecord[] | null>(null);
let versionsFailed = $state(false);
let stats = $state<AppViewStatsResponse | null>(null);
let statsLoading = $state(false);
let statsError = $state("");
let disposed = false;
const domainListeners = new Set<(change: AppDomainChange) => void>();
onDestroy(() => (disposed = true));

function initialValues(current: AppRecord): AppValues {
  const value = <T,>(key: keyof AppValues, fallback: T) => (draft && key in draft ? (draft[key] as T) : fallback);
  return {
    slug: value("slug", current.slug),
    targetType: value("targetType", current.targetType),
    targetRef: value("targetRef", current.targetRef),
    visibility: value("visibility", current.visibility),
    appScopes: value("appScopes", current.appScopes),
    hideCohubBar: value("hideCohubBar", hidesCohubBar(current.meta)),
  };
}

async function loadVersions(id: string) {
  versionsFailed = false;
  try {
    const result = await client.apps.listVersions(id);
    if (!disposed) versions = (versions ?? []).reduce(upsertAppVersion, result.versions);
  } catch {
    if (!disposed) versionsFailed = true;
  }
}

async function loadStats(id: string, consent = false) {
  if (statsLoading) return;
  statsLoading = true;
  statsError = "";
  try {
    if (consent && !(await authorize(["app.manage"]))) throw new Error("denied");
    if (consent) manageGranted = true;
    const result = await client.apps.getStats(id);
    if (!disposed) stats = result;
  } catch {
    if (!disposed) statsError = m.app_stats_unavailable({}, { locale });
  } finally {
    if (!disposed) statsLoading = false;
  }
}

async function loadPublicUrl(id: string) {
  try {
    const result = await client.apps.getPublicById(id);
    if (!disposed) publicUrl = result.publicUrl;
  } catch {
  }
}

async function loadPublisher(userUuid: string) {
  try {
    const { profiles } = await client.users.getProfiles({ userUuids: [userUuid] });
    if (!disposed) publisher = profiles[userUuid] ?? null;
  } catch {
  }
}

async function showPromotions() {
  if (await authorize(["space.edit"])) editGranted = true;
}

function domainCacheKey(appId: string) {
  const context = runtime.context;
  return context?.viewer ? JSON.stringify(["app-domains:v1", context.app.id, context.viewer.userUuid, spaceId, appId]) : null;
}

const domainCache: AppDomainCache = {
  read: async (_spaceId, appId) => readCache<AppDomainListResponse>(domainCacheKey(appId))?.value ?? null,
  write: (_spaceId, appId, list) => writeCache(domainCacheKey(appId), list),
};

function subscribeDomains(listener: (change: AppDomainChange) => void) {
  domainListeners.add(listener);
  return () => domainListeners.delete(listener);
}

function confirmDomainRemoval(hostname: string) {
  return feedback.ask({
    title: m.app_domain_remove({}, { locale }),
    message: m.app_domain_remove_confirm({ hostname }, { locale }),
    confirmLabel: m.app_domain_remove({}, { locale }),
    cancelLabel: m.common_cancel({}, { locale }),
    danger: true,
  });
}

onMount(() => {
  const current = untrack(() => app);
  if (!current) return;
  void loadVersions(current.id);
  void loadPublisher(current.userUuid);
  if (current.status === "published") void loadPublicUrl(current.id);
  if (untrack(() => canManage)) void loadStats(current.id);
  const stop = subscribeSpace(spaceId, (event) => {
    const published = parseAppVersionPublished(event);
    if (published?.app.id === current.id) {
      if (isNewerAppSnapshot(app, published.app)) show(published.app);
      versions = upsertAppVersion(versions ?? [], published.version);
      return;
    }
    const change = parseAppDomainEvent(event);
    if (change) for (const listener of domainListeners) listener(change);
  });
  return () => stop?.();
});

function show(next: AppRecord) {
  setDetail({ kind: "app", data: next });
  if (next.status === "published" && !publicUrl) void loadPublicUrl(next.id);
}

async function manage(run: (current: AppRecord) => Promise<void>) {
  const current = app;
  if (!current) return false;
  const done = await action(["app.manage"], () => run(current));
  if (done) manageGranted = true;
  return done;
}

async function save({ hideCohubBar, ...values }: AppValues) {
  const saved = await manage(async (current) => {
    const input: AppUpdateInput = hideCohubBar === hidesCohubBar(current.meta) ? values : { ...values, meta: withCohubBar(current.meta, hideCohubBar) };
    show((await client.apps.update(current.id, input)).app);
    updateDraft(null);
  });
  if (saved) {
    editing = false;
    feedback.notify(m.resource_app_saved({}, { locale }));
  }
}

async function publish() {
  let published = 0;
  const saved = await manage(async (current) => {
    const result = await client.apps.publishVersion(current.id);
    published = result.version.version;
    show(result.app);
    versions = upsertAppVersion(versions ?? [], result.version);
  });
  if (saved) feedback.notify(m.resource_app_published_version({ version: published }, { locale }));
}

async function disable() {
  await manage(async (current) => {
    show((await client.apps.update(current.id, { status: "disabled" })).app);
  });
}

async function remove() {
  const current = app;
  if (!current) return;
  const confirmed = await feedback.ask({
    title: m.resource_app_delete_app_title({}, { locale }),
    message: m.resource_app_delete_app_message({ title: resourceTitle({ kind: "app", data: current }, locale) }, { locale }),
    confirmLabel: m.common_delete({}, { locale }),
    cancelLabel: m.common_cancel({}, { locale }),
    danger: true,
  });
  if (!confirmed) return;
  const deleted = await action(["app.manage"], () => client.apps.delete(current.id).then(() => {}));
  if (deleted) removed(m.resource_app_deleted({}, { locale }));
}
</script>

{#snippet reveal(Icon: LucideIcon, label: string, actionLabel: string, onclick: () => void)}
  <div class="flex items-center justify-between gap-3 border-b border-border-subtle/70 pb-5">
    <span class="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-text-placeholder"><Icon class="h-3.5 w-3.5 text-text-tertiary" />{label}</span>
    <Button variant="ghost" {onclick}>{actionLabel}</Button>
  </div>
{/snippet}

{#if app && detail && status && visibility}
  <article class="space-y-6 px-4 py-5 sm:space-y-8 sm:px-6">
    <header class="flex flex-col gap-4 border-b border-border-subtle/70 pb-5 lg:flex-row lg:items-start lg:justify-between">
      <div class="min-w-0 space-y-2">
        <h1 class="text-[24px] font-semibold tracking-tight break-words text-text-primary sm:text-[28px]">{resourceTitle(detail, locale)}</h1>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusBadge tone={status.tone} label={status.label} />
          <StatusBadge tone={visibility.tone} label={visibility.label} />
          <span class="font-mono text-[11px] text-text-tertiary">/{app.slug}</span>
          <CopyButton value={app.id} label={m.resource_app_copy_app_id({}, { locale })} />
        </div>
      </div>
      {#if !editing}
        <div class="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {#if app.status === "published"}
            <Button variant="brand" icon={PanelRight} block class="col-span-2" onclick={() => navigateRelated({ kind: "app", ref: app.id })}>{m.resource_app_open({}, { locale })}</Button>
            {#if publicUrl}<Button icon={ExternalLink} block href={publicUrl}>{m.app_view_new_tab({}, { locale })}</Button>{/if}
          {/if}
          <Button icon={Pencil} block disabled={busy} onclick={() => (editing = true)}>{m.common_edit({}, { locale })}</Button>
          {#if app.status === "published"}
            <Button icon={Power} block disabled={busy} onclick={disable}>{m.resource_app_disable({}, { locale })}</Button>
          {:else}
            <Button variant="primary" icon={Rocket} block disabled={busy} onclick={publish}>{m.resource_app_publish({}, { locale })}</Button>
          {/if}
          <Button variant="danger" icon={Trash2} block disabled={busy} onclick={remove}>{m.common_delete({}, { locale })}</Button>
        </div>
      {/if}
    </header>

    {#if editing}
      <AppForm initial={initialValues(app)} {busy} onchange={(values) => updateDraft(values)} onsubmit={save} oncancel={() => { updateDraft(null); editing = false; }} />
    {:else}
      {#if stats || statsLoading || statsError}
        <AppViewStats {locale} {stats} loading={statsLoading} error={statsError} onRetry={() => void loadStats(app.id, true)} />
      {:else}
        {@render reveal(BarChart3, m.app_stats_views({}, { locale }), m.resource_app_show_stats({}, { locale }), () => void loadStats(app.id, true))}
      {/if}
      {#if publicUrl && app.status === "published"}
        {#if canEditSpace}
          <AppPromotions {locale} appId={app.id} {publicUrl} api={client.apps} />
        {:else}
          {@render reveal(BarChart3, m.app_promotions_title({}, { locale }), m.app_promo_show({}, { locale }), () => void showPromotions())}
        {/if}
      {/if}
      {#if canManage}
        {#key app.id}
          <AppCustomDomain {locale} {spaceId} appId={app.id} revision={`${app.status}:${app.visibility}:${app.currentVersionId ?? ""}`} api={client.apps} cache={domainCache} subscribe={subscribeDomains} confirmRemove={confirmDomainRemoval} billingHref={webUrl("/settings/billing")} />
        {/key}
      {/if}

      <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-8">
        <div class="min-w-0 space-y-6">
          <section class="space-y-3">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 class={eyebrowClass}>{m.resource_app_target({}, { locale })}</h2>
                <p class="mt-1 font-mono text-[11px] text-text-placeholder">v{app.latestVersion || 0}</p>
              </div>
              {#if app.status === "published"}
                <Button variant="primary" icon={Rocket} block loading={busy} onclick={publish}>{m.resource_app_update_version({}, { locale })}</Button>
              {/if}
            </div>
            <div class="relative overflow-hidden rounded-[8px] bg-bg-elevated/40 ring-1 ring-border-subtle/60">
              <div class="absolute top-0 left-0 h-full w-[3px] bg-brand"></div>
              <div class="py-4 pr-5 pl-6">
                <div class="font-mono text-[13px] break-all text-text-primary">{app.targetRef}</div>
                <div class="mt-2 text-[12px] text-text-tertiary">{({ file: m.resource_app_target_file, directory: m.resource_app_target_directory, port: m.resource_app_target_port })[app.targetType]({}, { locale })}</div>
              </div>
            </div>
          </section>
          <section class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
            <div class={cardClass}>
              <div class={labelClass}>{m.app_view_app_permissions({}, { locale })}</div>
              <div class="mt-1 font-mono text-[12px] break-words text-text-primary">{app.appScopes.length ? app.appScopes.join(", ") : "—"}</div>
            </div>
            <div class={cardClass}>
              <div class={labelClass}>{m.app_view_cohub_bar({}, { locale })}</div>
              <div class="mt-1"><StatusBadge tone={hiddenBar ? "muted" : "success"} label={hiddenBar ? m.resource_app_hidden({}, { locale }) : m.resource_app_shown({}, { locale })} /></div>
            </div>
          </section>
        </div>
        <aside class="space-y-5 text-[13px]">
          {#if publicUrl && app.status === "published"}
            <div class="flex min-w-0 items-center gap-2 rounded-[6px] bg-bg-elevated/30 px-3 py-2">
              <a href={publicUrl} target="_blank" rel="noopener noreferrer" class="min-w-0 flex-1 truncate font-mono text-[12px] text-text-secondary hover:text-brand">{publicUrl.replace(/^https?:\/\//, "")}</a>
              <CopyButton variant="action" value={publicUrl} label={m.app_view_copy_url({}, { locale })} text="" />
            </div>
          {/if}
          <div class="space-y-3">
            <h2 class={eyebrowClass}>{m.cron_metadata({}, { locale })}</h2>
            <dl class="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[12px]">
              <dt class="text-text-placeholder">{m.cron_created({}, { locale })}</dt><dd class="text-text-secondary">{formatDateTime(app.createdAt, locale)}</dd>
              <dt class="text-text-placeholder">{m.cron_updated({}, { locale })}</dt><dd class="text-text-secondary">{formatDateTime(app.updatedAt, locale)}</dd>
              <dt class="text-text-placeholder">{m.resource_app_published({}, { locale })}</dt><dd class="text-text-secondary">{formatDateTime(app.publishedAt, locale)}</dd>
              <dt class="text-text-placeholder">{m.resource_app_publisher({}, { locale })}</dt>
              <dd class="min-w-0">{#if publisher}<span class="block truncate text-text-secondary" title={app.userUuid}>{publisher.displayName}</span>{:else}<CopyButton value={app.userUuid} label={m.resource_app_publisher({}, { locale })} />{/if}</dd>
            </dl>
          </div>
        </aside>
      </section>

      <section class="border-t border-border-subtle/70 pt-6" aria-labelledby="app-versions">
        <h2 id="app-versions" class="mb-3 {eyebrowClass}">{m.resource_app_versions({}, { locale })}</h2>
        {#if versionsFailed}
          <Notice>{m.resource_app_error({}, { locale })}{#snippet action()}<Button variant="ghost" onclick={() => loadVersions(app.id)}>{m.common_retry({}, { locale })}</Button>{/snippet}</Notice>
        {:else if !versions}
          <div class="space-y-1.5" aria-busy="true">{#each Array(3) as _, index}<div class="h-10 animate-pulse rounded bg-bg-elevated/40" style:opacity={1 - index * 0.25}></div>{/each}</div>
        {:else if versions.length}
          <ul class="divide-y divide-border-subtle/50">
            {#each versions as version (version.id)}
              {@const session = version.source?.session}
              <li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-1 py-2.5 text-[12px] sm:grid-cols-[96px_minmax(0,1fr)_minmax(0,200px)_150px]">
                <span class="flex items-center gap-2">
                  <span class="font-mono text-text-primary">v{version.version}</span>
                  {#if version.id === app.currentVersionId}<span class="rounded-full bg-brand-muted px-2 py-0.5 text-[10px] font-medium text-brand">{m.resource_app_current({}, { locale })}</span>{/if}
                </span>
                <span class="justify-self-end font-mono text-text-placeholder sm:order-last sm:justify-self-start">{formatDateTime(version.createdAt, locale)}</span>
                <span class="hidden truncate font-mono text-text-tertiary sm:block" title={`${version.targetType}:${version.targetRef}`}>{version.targetType}:{version.targetRef}</span>
                {#if session}
                  <button type="button" class="col-span-2 flex min-w-0 items-center gap-1.5 text-left text-text-secondary transition-colors hover:text-brand sm:col-span-1" title={session.title ?? session.id} onclick={() => navigateRelated({ kind: "session", spaceId, sessionId: session.id, ...(version.source?.turnId ? { turnId: version.source.turnId } : {}) })}>
                    <MessageSquare class="h-3.5 w-3.5 shrink-0 text-text-placeholder" /><span class="truncate">{session.title || m.resource_app_untitled_session({}, { locale })}</span>
                  </button>
                {:else}
                  <span class="col-span-2 truncate text-text-placeholder sm:col-span-1">{version.source?.via ? m.resource_app_via({ source: version.source.via }, { locale }) : "—"}</span>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="py-6 text-[13px] text-text-tertiary">{m.resource_app_no_versions({}, { locale })}</p>
        {/if}
      </section>
    {/if}
  </article>
{/if}
