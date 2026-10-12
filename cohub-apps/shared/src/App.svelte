<script lang="ts">
import { onMount, tick } from "svelte";
import {
  writeResourceAppTarget,
  type ResourceAppTarget,
  type ResourceAppKind,
} from "@cohub/protocol";
import type { ResourceViewLoader } from "./view-types";
import type { AppRuntimeContext, Permission } from "@neta-art/cohub";
import type { AppNavigationTarget } from "@cohub/protocol/app-navigation";
import { RefreshCw, LockKeyhole, AlertCircle } from "lucide-svelte";
import {
  client,
  loadResource,
  nativeResourceUrl,
  openRelated,
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
import ResourceList from "./ResourceList.svelte";
import {
  readBrowserRoute,
  scopeHash,
  type ResourceScope,
} from "./browser-route";
import type { ResourceRow } from "./resource-list";

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
let navigationFallback = $state<string | null>(null);
let visible = $state(true);
let scope = $state<ResourceScope | null>(null);
let invalidRoute = $state(false);
let acceptedHash = "";
const scrollPositions = new Map<string, number>();
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
  if (!context || (target && target.id !== "new" && !detail && loading)) return;
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
  const account = scopes.every((permission) => permission.startsWith("user."));
  const requestedSpace = spaceId;
  const result = await client.auth.authorize({
    target: account
      ? { kind: "account" }
      : { kind: "space", spaceId: requestedSpace },
    scopes,
    fallback: "none",
    reason: t(write ? "write_reason" : "access_reason"),
  });
  return (
    result.status === "granted" &&
    (account
      ? result.target.kind === "account"
      : result.target.kind === "space" &&
        result.target.spaceId === requestedSpace)
  );
}
function detailAccess(current: AppRuntimeContext | null) {
  if (!current) return false;
  return kind === "task" && scope?.kind === "mine"
    ? Boolean(current.permissions?.viewerScopes.includes("user.taskrun.list"))
    : hasScopes(current, spaceId, readScopes(kind));
}
async function requestAccess() {
  busy = true;
  try {
    if (
      await authorize(
        kind === "task" && scope?.kind === "mine"
          ? ["user.taskrun.list"]
          : readScopes(kind),
      )
    )
      await refresh();
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
function goHash(hash: string) {
  if (busy || !persistDraft()) return;
  scrollPositions.set(acceptedHash, window.scrollY);
  if (location.hash === hash) return;
  location.hash = hash;
}
function openRow(row: ResourceRow) {
  const params = new URLSearchParams(scopeHash(scope).slice(1));
  if (row.spaceId) params.set("space", row.spaceId);
  else params.delete("space");
  writeResourceAppTarget(params, { kind, id: row.id });
  goHash(`#${params}`);
}
function openDetail(id: string, base?: string) {
  const params = new URLSearchParams(scopeHash(scope).slice(1));
  if (spaceId) params.set("space", spaceId);
  writeResourceAppTarget(params, { kind, id, ...(base ? { base } : {}) });
  goHash(`#${params}`);
}
function createResource() {
  if (scope?.kind !== "space") return;
  const params = new URLSearchParams(scopeHash(scope).slice(1));
  writeResourceAppTarget(params, { kind, id: "new" });
  goHash(`#${params}`);
}
async function navigateRelated(target: AppNavigationTarget) {
  const requestRevision = revision;
  navigationFallback = null;
  try {
    const fallback = await openRelated(target);
    if (requestRevision === revision) navigationFallback = fallback;
  } catch {
    if (requestRevision === revision) error = "navigation_failed";
  }
}
async function runApp(row: ResourceRow) {
  await navigateRelated({ kind: "app", ref: row.id });
}
async function navigate() {
  if (!context) return;
  const route = readBrowserRoute(location.hash, kind, context);
  const nextKey = JSON.stringify([context.viewer?.userUuid, route]);
  if (nextKey === routeKey) return;
  if (busy || (dirty && !persistDraft())) {
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${location.search}${acceptedHash}`,
    );
    return;
  }
  if (!location.hash && route.scope && !route.invalid) {
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${location.search}${scopeHash(route.scope)}`,
    );
  }
  acceptedHash = location.hash;
  routeKey = nextKey;
  if (context.invocation?.surface === "app" && acceptedHash) {
    void client.navigation
      .open({
        kind: "app",
        ref: context.app.id,
        launch: { hash: acceptedHash },
      })
      .catch(() => {});
  }
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
  navigationFallback = null;
  scope = route.scope;
  invalidRoute = route.invalid;
  target = route.target;
  spaceId = route.spaceId;
  const scrollRevision = revision;
  void tick().then(() => {
    if (scrollRevision === revision)
      window.scrollTo({
        top: scrollPositions.get(acceptedHash) ?? 0,
        behavior: "instant",
      });
  });
  if (!target) {
    storageKey = null;
    client.app.window.setState({ dirty: false });
    return;
  }
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
  if (detailAccess(context)) {
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
  if (kind === "task" && spaceId && !denied) {
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
    const hadAccess = target && detailAccess(context);
    const lostAccess = hadAccess && !detailAccess(next);
    if (identityChanged) {
      scrollPositions.clear();
      busy = false;
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
    if (!next) {
      loading = false;
      target = null;
      scope = null;
      error = "error";
    }
    locale = next?.locale === "zh-CN" ? "zh-CN" : "en";
    const wasVisible = visible;
    visible = next?.window?.visible ?? true;
    if (next) void navigate();
    if (visible && !wasVisible && !lostAccess && target) void refresh();
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
  const saveScroll = () => {
    if (location.hash === acceptedHash)
      scrollPositions.set(acceptedHash, window.scrollY);
  };
  window.addEventListener("scroll", saveScroll, { passive: true });
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
    window.removeEventListener("scroll", saveScroll);
    window.removeEventListener("hashchange", navigate);
    window.removeEventListener("beforeunload", unload);
    document.removeEventListener("visibilitychange", visibility);
  };
});
</script>

<main>
  {#if target}
	<header class="toolbar">
		<div class="toolbar">{#if target}<button disabled={busy} onclick={() => goHash(scopeHash(scope))}>← {t("back_list")}</button>{/if}<span class="eyebrow">{t(kind)}</span></div>
		<div class="toolbar">
			{#if target && (kind === "checkpoint" || kind === "app" || kind === "cronjob")}
				<a class="eyebrow" href={nativeResourceUrl(spaceId, target)} target="_blank" rel="noopener noreferrer" title={t("more_actions_hint")}>{t("more_actions")} ↗</a>
			{/if}
			{#if target}<button class="icon" aria-label={t("retry")} disabled={loading || busy} onclick={() => void refresh()}><RefreshCw size={15} /></button>{/if}
		</div>
	</header>
  {/if}
	{#if context && !invalidRoute}
    <div hidden={Boolean(target)}>
      <ResourceList {kind} {scope} {context} {locale} {busy} visible={visible && !target}
        onScope={(next) => goHash(scopeHash(next))} onOpen={openRow} onCreate={createResource} onRun={runApp} />
    </div>
  {/if}
  {#if navigationFallback}<div class="notice" role="status">{t("navigation_failed")} <a href={navigationFallback} target="_blank" rel="noopener noreferrer">{t("open")} ↗</a></div>{/if}
  {#if invalidRoute}<section class="empty">{t("error")}</section>{/if}
	{#if error && !denied}<div class="notice" role="status"><AlertCircle size={16} />{t(error)}</div>{/if}
	{#if denied}<section class="empty"><LockKeyhole size={24} /><p>{t("denied")}</p><button disabled={busy} onclick={requestAccess}>{t("access")}</button></section>
	{:else if loading && !detail}<section class="empty" aria-busy="true">{t("loading")}</section>
	{:else if target}
		{#key `${spaceId}:${target.kind}:${target.id}:${target.base ?? ""}`}
			<ResourceView {loadView} {target} {spaceId} {detail} {locale} {busy} {draft} {action} {authorize} {openDetail} {navigateRelated} updateDraft={scopedUpdateDraft} refresh={refresh} />
		{/key}
	{/if}
</main>
