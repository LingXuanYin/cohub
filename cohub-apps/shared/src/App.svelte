<script lang="ts">
import { onMount } from "svelte";
import {
  readResourceAppLaunch,
  type ResourceAppTarget,
  type ResourceAppKind,
} from "@cohub/protocol";
import type { ResourceViewLoader } from "./view-types";
import type { AppRuntimeContext, Permission } from "@neta-art/cohub";
import { RefreshCw, LockKeyhole, AlertCircle } from "lucide-svelte";
import {
  client,
  loadResource,
  nativeResourceUrl,
  type ResourceDetail,
} from "./client";
import {
  forget,
  hasScopes,
  readScopes,
  readStored,
  resourceStorageKey,
  statusCode,
  store,
} from "./state";
import { message, type Locale, type MessageKey } from "./i18n";
import ResourceView from "./ResourceView.svelte";

let {
  kind,
  loadView,
}: { kind: ResourceAppKind; loadView: ResourceViewLoader } = $props();
let context = $state<AppRuntimeContext | null>(null);
let locale = $state<Locale>("en");
let target = $state<ResourceAppTarget | null>(null);
let spaceId = $state("");
let detail = $state<ResourceDetail | null>(null);
let loading = $state(true);
let denied = $state(false);
let error = $state<MessageKey | null>(null);
let busy = $state(false);
let visible = true;
let revision = 0;
let refreshPending = false;
let dirty = false;
let draft = $state<Record<string, unknown> | null>(null);
let storageKey = $state<string | null>(null);
let routeKey = "";
const scopedUpdateDraft = $derived.by(() => {
  const key = storageKey;
  return (next: Record<string, unknown> | null) => {
    if (key === storageKey) updateDraft(next);
  };
});
let stopEvents: (() => void) | null = null;
let poll: ReturnType<typeof setTimeout> | null = null;
const t = (key: MessageKey) => message(locale, key);
const title = $derived(
  detail?.kind === "task"
    ? detail.data.run.taskType
    : detail?.kind === "checkpoint"
      ? detail.data.description
      : detail?.kind === "cronjob"
        ? detail.data.title
        : detail?.kind === "app"
          ? `${detail.data.meta?.title ?? detail.data.slug} · ${t("details")}`
          : t(kind),
);

$effect(() => {
  document.title = title;
  client.app.window.setState({ title });
});

function persistDraft() {
  if (!dirty) return true;
  if (!store(storageKey && `${storageKey}:draft`, draft, "persistent")) {
    error = "draft_failed";
    return false;
  }
  client.app.window.setState({ dirty: false });
  return true;
}
function updateDraft(next: Record<string, unknown> | null) {
  draft = next;
  dirty = next !== null;
  if (!dirty) forget(storageKey && `${storageKey}:draft`, "persistent");
  else store(storageKey && `${storageKey}:draft`, next, "persistent");
  client.app.window.setState({ dirty });
}
function clearPoll() {
  if (poll) clearTimeout(poll);
  poll = null;
}
function scheduleRefresh() {
  clearPoll();
  if (
    visible &&
    document.visibilityState === "visible" &&
    detail?.kind === "task" &&
    ["pending", "running"].includes(detail.data.run.status)
  ) {
    poll = setTimeout(() => void refresh(), 5000);
  }
}
async function refresh() {
  if (!target || target.id === "new" || refreshPending) return;
  const currentRevision = revision;
  const currentTarget = target;
  const currentSpace = spaceId;
  refreshPending = true;
  try {
    const next = await loadResource(currentSpace, currentTarget);
    if (currentRevision !== revision) return;
    detail = next;
    denied = false;
    error = null;
    if (JSON.stringify(next).length < 500_000)
      store(storageKey, { at: Date.now(), detail: next });
  } catch (cause) {
    if (currentRevision !== revision) return;
    if ([401, 403, 404].includes(statusCode(cause) ?? 0)) {
      forget(storageKey);
      detail = null;
      denied = statusCode(cause) !== 404;
      error = denied ? "denied" : "error";
    } else error = detail ? "stale" : "error";
  } finally {
    if (currentRevision === revision) {
      loading = false;
      refreshPending = false;
      scheduleRefresh();
    }
  }
}
async function authorize(scopes: Permission[], write = false) {
  const result = await client.auth.authorize({
    target: { kind: "space", spaceId },
    scopes,
    fallback: "none",
    reason: t(write ? "write_reason" : "access_reason"),
  });
  return (
    result.status === "granted" &&
    result.target.kind === "space" &&
    result.target.spaceId === spaceId
  );
}
async function requestAccess() {
  busy = true;
  try {
    if (await authorize(readScopes(kind))) await refresh();
  } catch {
    error = "denied";
  } finally {
    busy = false;
  }
}
async function action(
  scopes: Permission[],
  run: () => Promise<void>,
  write = true,
) {
  if (busy) return false;
  busy = true;
  const currentRevision = revision;
  if (write) client.app.window.setState({ status: "saving", dirty: true });
  try {
    if (!(await authorize(scopes, write)) || currentRevision !== revision)
      return false;
    await run();
    if (currentRevision === revision) error = null;
    return true;
  } catch {
    if (currentRevision === revision) error = write ? "save_failed" : "error";
    return false;
  } finally {
    busy = false;
    client.app.window.setState({ status: "idle", dirty });
  }
}
async function navigate() {
  const launch = readResourceAppLaunch(location.hash);
  const nextKey = JSON.stringify([context?.viewer?.userUuid, launch]);
  if (nextKey === routeKey) return;
  if (dirty && !persistDraft()) return;
  routeKey = nextKey;
  window.scrollTo({ top: 0, behavior: "instant" });
  revision += 1;
  refreshPending = false;
  clearPoll();
  stopEvents?.();
  stopEvents = null;
  detail = null;
  error = null;
  denied = false;
  draft = null;
  dirty = false;
  loading = false;
  if (!context || !launch || launch.target.kind !== kind) {
    target = null;
    return;
  }
  spaceId = launch.spaceId;
  target = launch.target;
  storageKey = resourceStorageKey(
    context,
    spaceId,
    kind,
    target.id,
    target.base,
  );
  draft = readStored(storageKey && `${storageKey}:draft`, "persistent");
  dirty = draft !== null;
  client.app.window.setState({ dirty });
  if (target.id === "new") return;
  loading = true;
  if (hasScopes(context, spaceId, readScopes(kind))) {
    const cached = readStored<{ at: number; detail: ResourceDetail }>(
      storageKey,
    );
    if (cached && Date.now() - cached.at < 300_000) {
      detail = cached.detail;
      loading = false;
    }
  }
  const currentRevision = revision;
  await refresh();
  if (currentRevision !== revision) return;
  if (denied && (kind === "task" || kind === "checkpoint")) {
    await requestAccess();
  }
  if (currentRevision !== revision) return;
  if (kind === "task" && !denied) {
    stopEvents = client.space(spaceId).subscribe((event) => {
      const task = (event.payload as { task?: { id?: string } })?.task;
      if (visible && event.type === "task.updated" && task?.id === target?.id)
        void refresh();
    });
  }
}
onMount(() => {
  const updateContext = (next: AppRuntimeContext | null) => {
    const identityChanged =
      context?.viewer?.userUuid !== next?.viewer?.userUuid;
    const hadAccess = context && hasScopes(context, spaceId, readScopes(kind));
    const lostAccess =
      hadAccess && (!next || !hasScopes(next, spaceId, readScopes(kind)));
    if (identityChanged) {
      dirty = false;
      detail = null;
      draft = null;
    }
    if (lostAccess) {
      revision += 1;
      refreshPending = false;
      clearPoll();
      stopEvents?.();
      stopEvents = null;
      forget(storageKey);
      detail = null;
      denied = true;
      loading = false;
      error = "denied";
    }
    context = next;
    locale = next?.locale === "zh-CN" ? "zh-CN" : "en";
    const wasVisible = visible;
    visible = next?.window?.visible ?? true;
    void navigate();
    if (visible && !wasVisible && !lostAccess) void refresh();
    if (!visible) clearPoll();
  };
  const stopContext = client.app.onContextChanged(updateContext);
  const stopAppearance = client.app.appearance.sync();
  const stopClose = client.app.window.onBeforeClose(
    () => !busy && persistDraft(),
  );
  void client.context().then(updateContext, () => {
    loading = false;
    error = "error";
  });
  const visibility = () => {
    if (document.visibilityState === "visible" && visible) void refresh();
    else clearPoll();
  };
  const unload = (event: BeforeUnloadEvent) => {
    if (busy || !persistDraft()) event.preventDefault();
  };
  window.addEventListener("hashchange", navigate);
  window.addEventListener("beforeunload", unload);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    revision += 1;
    persistDraft();
    clearPoll();
    stopEvents?.();
    stopContext();
    stopAppearance();
    stopClose();
    window.removeEventListener("hashchange", navigate);
    window.removeEventListener("beforeunload", unload);
    document.removeEventListener("visibilitychange", visibility);
  };
});
</script>

<main>
	<header class="toolbar">
		<span class="eyebrow">{t(kind)}</span>
		<div class="toolbar">
			{#if target && (kind === "checkpoint" || kind === "app" || kind === "cronjob")}
				<a class="eyebrow" href={nativeResourceUrl(spaceId, target)} target="_blank" rel="noopener noreferrer" title={t("more_actions_hint")}>{t("more_actions")} ↗</a>
			{/if}
			<button class="icon" aria-label={t("retry")} disabled={loading || busy} onclick={() => void refresh()}><RefreshCw size={15} /></button>
		</div>
	</header>
	{#if error && !denied}<div class="notice" role="status"><AlertCircle size={16} />{t(error)}</div>{/if}
	{#if denied}<section class="empty"><LockKeyhole size={24} /><p>{t("denied")}</p><button disabled={busy} onclick={requestAccess}>{t("access")}</button></section>
	{:else if loading && !detail}<section class="empty" aria-busy="true">{t("loading")}</section>
	{:else if target}
		{#key `${spaceId}:${target.kind}:${target.id}:${target.base ?? ""}`}
			<ResourceView {loadView} {target} {spaceId} {detail} {locale} {busy} {draft} {action} {authorize} updateDraft={scopedUpdateDraft} refresh={refresh} />
		{/key}
	{:else}<section class="empty">{t("empty")}</section>{/if}
</main>
