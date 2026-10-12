<script lang="ts">
import { onMount, untrack } from "svelte";
import type { AppRuntimeContext } from "@neta-art/cohub";
import type { ResourceAppKind } from "@cohub/protocol";
import { client } from "./client";
import {
  listResources,
  type ResourceRow,
  type TaskFilter,
} from "./resource-list";
import {
  scopeHash,
  scopePermissions,
  type ResourceScope,
} from "./browser-route";
import {
  forget,
  hasScopes,
  readStored,
  resourceStorageKey,
  statusCode,
  store,
} from "./state";
import { message, type Locale, type MessageKey } from "./i18n";

let {
  kind,
  scope,
  context,
  locale,
  visible,
  busy,
  onScope,
  onOpen,
  onCreate,
  onRun,
}: {
  kind: ResourceAppKind;
  scope: ResourceScope | null;
  context: AppRuntimeContext;
  locale: Locale;
  visible: boolean;
  busy: boolean;
  onScope: (scope: ResourceScope) => void;
  onOpen: (row: ResourceRow) => void;
  onCreate: () => void;
  onRun: (row: ResourceRow) => void;
} = $props();
const t = (key: MessageKey) => message(locale, key);
let rows = $state<ResourceRow[]>([]);
let visibleCount = $state(30);
let cursor = $state<string | null>(null);
let filter = $state<TaskFilter>("all");
let loading = $state(false);
let loadingMore = $state(false);
let authorizing = $state(false);
let denied = $state(false);
let error = $state<MessageKey | null>(null);
let spaceNames = $state<Record<string, string>>({});
let refreshPending = false;
let generation = 0;
let disposed = false;
let poll: ReturnType<typeof setTimeout> | null = null;
let refreshedAt = 0;
const viewer = $derived(context.viewer?.userUuid ?? null);
const queryKey = $derived(`${viewer}:${scopeHash(scope)}:${filter}`);
const cacheKey = $derived(
  scope
    ? resourceStorageKey(
        context,
        scope.kind === "space" ? scope.spaceId : "mine",
        kind,
        "list",
        `${scopeHash(scope)}:${filter}`,
      )
    : null,
);
const allowed = $derived(
  scope
    ? scope.kind === "mine"
      ? Boolean(context.permissions?.viewerScopes.includes("user.taskrun.list"))
      : hasScopes(context, scope.spaceId, scopePermissions(kind, scope))
    : false,
);
const sourceSpace = $derived(context.invocation?.spaceId);
const sourceSession = $derived(context.invocation?.sessionId);
const scopeLabel = $derived(
  scope?.kind === "mine"
    ? t("mine")
    : scope?.kind === "space"
      ? `${spaceNames[scope.spaceId] ?? (context.shell?.space?.id === scope.spaceId ? context.shell.space.name : null) ?? t("space")}${scope.sessionId ? ` · ${t("session")}` : ""}`
      : t("choose_space"),
);

function stopPolling() {
  if (poll) clearTimeout(poll);
  poll = null;
}
function schedule() {
  stopPolling();
  if (
    visible &&
    document.visibilityState === "visible" &&
    kind === "task" &&
    rows.some((row) => row.status === "pending" || row.status === "running")
  )
    poll = setTimeout(() => void load("refresh"), 5000);
}
async function authorize() {
  if (!scope || authorizing) return false;
  const requested = scope;
  const requestKey = queryKey;
  authorizing = true;
  try {
    const result = await client.auth.authorize({
      target:
        requested.kind === "mine"
          ? { kind: "account" }
          : { kind: "space", spaceId: requested.spaceId },
      scopes: scopePermissions(kind, requested),
      fallback: "none",
      reason: t("access_reason"),
    });
    return (
      requestKey === queryKey &&
      result.status === "granted" &&
      (requested.kind === "mine"
        ? result.target.kind === "account"
        : result.target.kind === "space" &&
          result.target.spaceId === requested.spaceId)
    );
  } finally {
    if (!disposed) authorizing = false;
  }
}
async function load(
  mode: "replace" | "append" | "refresh" = "replace",
  allowConsent = false,
) {
  if (
    !scope ||
    refreshPending ||
    (mode === "refresh" && (!visible || document.visibilityState !== "visible"))
  )
    return;
  const requestKey = queryKey;
  const requestGeneration = generation;
  const key = cacheKey;
  const current = () =>
    !disposed && requestGeneration === generation && requestKey === queryKey;
  refreshPending = true;
  if (mode === "replace") loading = rows.length === 0;
  if (mode === "append") loadingMore = true;
  error = null;
  try {
    const requestScope = scope;
    const requestFilter = filter;
    const page = await listResources(
      kind,
      requestScope,
      requestFilter,
      mode === "append" ? cursor : null,
    );
    const refreshCount = mode === "refresh" ? rows.length : 0;
    const visited = new Set<string>();
    while (current() && page.cursor && page.rows.length < refreshCount && !visited.has(page.cursor)) {
      visited.add(page.cursor);
      const next = await listResources(kind, requestScope, requestFilter, page.cursor);
      page.rows.push(...next.rows);
      page.cursor = next.cursor;
    }
    if (!current()) return;
    if (mode === "append")
      rows = [
        ...new Map(
          [...rows, ...page.rows].map((row) => [row.id, row]),
        ).values(),
      ];
    else rows = [...new Map(page.rows.map((row) => [row.id, row])).values()];
    cursor = page.cursor;
    denied = false;
    refreshedAt = Date.now();
    if (JSON.stringify(rows).length < 500_000)
      store(key, { at: refreshedAt, rows, cursor });
  } catch (cause) {
    if (!current()) return;
    if ([401, 403].includes(statusCode(cause) ?? 0)) {
      rows = [];
      cursor = null;
      denied = true;
      forget(key);
      if (allowConsent && scope.kind === "space" && kind !== "cronjob") {
        refreshPending = false;
        try {
          if ((await authorize()) && current()) {
            await load();
            return;
          }
        } catch {
          if (current()) error = "denied";
        }
      }
    } else error = rows.length ? "stale" : "error";
  } finally {
    if (current()) {
      loading = false;
      loadingMore = false;
      refreshPending = false;
      schedule();
    }
  }
}
async function loadMore() {
  const key = queryKey;
  if (visibleCount >= rows.length) await load("append");
  if (key === queryKey) visibleCount += 30;
}
async function requestAccess() {
  try {
    if (await authorize()) await load();
  } catch {
    error = "denied";
  }
}
async function pickSpace() {
  if (busy || authorizing) return;
  const identity = viewer;
  authorizing = true;
  try {
    const result = await client.auth.authorize({
      target: { kind: "pick-space" },
      scopes: scopePermissions(kind, { kind: "space", spaceId: "" }),
      reason: t("access_reason"),
      alwaysAsk: true,
      fallback: "none",
    });
    if (
      disposed ||
      identity !== viewer ||
      result.status !== "granted" ||
      result.target.kind !== "space"
    )
      return;
    if (result.target.name)
      spaceNames = {
        ...spaceNames,
        [result.target.spaceId]: result.target.name,
      };
    onScope({ kind: "space", spaceId: result.target.spaceId });
  } catch {
    error = "denied";
  } finally {
    if (!disposed) authorizing = false;
  }
}
let loadedKey = "";
$effect(() => {
  const key = queryKey;
  if (key === loadedKey) return;
  loadedKey = key;
  untrack(() => {
    generation += 1;
    refreshPending = false;
    stopPolling();
    rows = [];
    visibleCount = 30;
    cursor = null;
    denied = false;
    error = null;
    const cached = allowed
      ? readStored<{ at: number; rows: ResourceRow[]; cursor: string | null }>(
          cacheKey,
        )
      : null;
    if (
      cached &&
      Date.now() - cached.at < 300_000 &&
      Array.isArray(cached.rows)
    ) {
      rows = cached.rows;
      cursor = cached.cursor;
    }
    if (scope && visible) void load("replace", true);
  });
});
let previouslyAllowed = false;
let permissionKey = "";
$effect(() => {
  const permission = allowed;
  const key = queryKey;
  if (permissionKey === key && previouslyAllowed && !permission)
    untrack(() => {
      generation += 1;
      refreshPending = false;
      rows = [];
      cursor = null;
      denied = true;
      loading = false;
      loadingMore = false;
      stopPolling();
      forget(cacheKey);
    });
  permissionKey = key;
  previouslyAllowed = permission;
});
$effect(() => {
  const shown = visible;
  untrack(() => {
    if (shown && scope) void load("refresh");
    else schedule();
  });
});
onMount(() => {
  const visibility = () => {
    if (visible && document.visibilityState === "visible") void load("refresh");
    else stopPolling();
  };
  document.addEventListener("visibilitychange", visibility);
  return () => {
    disposed = true;
    generation += 1;
    stopPolling();
    document.removeEventListener("visibilitychange", visibility);
  };
});
</script>

<section class="content resource-browser" aria-label={t(kind)}>
  <div class="heading"><h1>{t(kind)}</h1><div class="toolbar">
    <button disabled={busy || authorizing} onclick={pickSpace}>{scopeLabel} ▾</button>
    {#if scope?.kind === "space" && (kind === "checkpoint" || kind === "cronjob")}<button class="primary" disabled={busy} onclick={onCreate}>{t("create")}</button>{/if}
    <button disabled={loading || loadingMore || busy} onclick={() => load()}>{t("retry")}</button>
  </div></div>
  {#if kind === "task"}<div class="toolbar sections">
    {#if sourceSpace}<button class:active={scope?.kind === "space" && scope.spaceId === sourceSpace && !scope.sessionId} disabled={busy} onclick={() => onScope({ kind: "space", spaceId: sourceSpace! })}>{t("space")}</button>{/if}
    {#if sourceSpace && sourceSession}<button class:active={scope?.kind === "space" && scope.sessionId === sourceSession} disabled={busy} onclick={() => onScope({ kind: "space", spaceId: sourceSpace!, sessionId: sourceSession })}>{t("session")}</button>{/if}
    <button class:active={scope?.kind === "mine"} disabled={busy} onclick={() => onScope({ kind: "mine" })}>{t("mine")}</button>
    <select class="list-filter" aria-label={t("status")} bind:value={filter}>{#each ["all", "active", "pending", "running", "completed", "failed"] as value}<option value={value}>{t(value as MessageKey)}</option>{/each}</select>
  </div>{/if}
  {#if error}<p class="notice" role="status">{t(error)}</p>{/if}
  {#if !scope}<div class="empty"><p>{t("choose_space_hint")}</p><button disabled={authorizing} onclick={pickSpace}>{t("choose_space")}</button></div>
  {:else if denied}<div class="empty"><p>{t("denied")}</p><button disabled={authorizing} onclick={requestAccess}>{t("access")}</button></div>
  {:else if loading && !rows.length}<div class="empty" aria-busy="true">{t("loading")}</div>
  {:else}<div class="rows">
    {#each rows.slice(0, visibleCount) as row (row.id)}<div class="resource-row">
      <button class="row resource-link" disabled={busy} onclick={() => onOpen(row)}>
        <span class="resource-text"><strong>{row.title}</strong>{#if row.subtitle}<span class="meta">{row.subtitle}</span>{/if}</span>
        <span class="resource-meta">{#if row.status}<span class="status" data-status={row.status}>{t(row.status)}</span>{/if}<time>{row.createdAt ? new Date(row.createdAt).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</time></span>
      </button>
      {#if kind === "app"}<button class="run-app" disabled={busy || row.status === "disabled"} onclick={() => onRun(row)}>{t("open")} ↗</button>{/if}
    </div>{:else}<div class="empty">{t("empty_list")}</div>{/each}
  </div>{/if}
  {#if (cursor || visibleCount < rows.length) && !denied}<button disabled={loadingMore || busy} onclick={loadMore}>{t(loadingMore ? "loading" : "more")}</button>{/if}
</section>
