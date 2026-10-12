import type { AppRuntimeContext, Permission } from "@neta-art/cohub";
import { scopeListHasPermission } from "@neta-art/cohub";
import type { ResourceAppKind } from "@cohub/protocol";

export function readScopes(kind: ResourceAppKind): Permission[] {
  return [
    {
      task: "taskrun.view",
      checkpoint: "checkpoint.view",
      cronjob: "cronjob.view",
      app: "space.view",
    }[kind] as Permission,
  ];
}

export function hasScopes(
  context: AppRuntimeContext,
  spaceId: string,
  scopes: Permission[],
) {
  const grants =
    context.permissions?.viewerGrants
      ?.filter((grant) => grant.spaceId === spaceId)
      .flatMap((grant) => grant.scopes) ?? [];
  const owned =
    context.app.homeSpace?.id === spaceId
      ? (context.permissions?.appScopes ?? [])
      : [];
  return scopes.every((scope) =>
    scopeListHasPermission([...grants, ...owned], scope),
  );
}

export function resourceStorageKey(
  context: AppRuntimeContext,
  spaceId: string,
  kind: ResourceAppKind,
  id: string,
  base = "",
) {
  return context.viewer?.userUuid
    ? JSON.stringify([
        "resource-app:v1",
        context.app.id,
        context.viewer.userUuid,
        spaceId,
        kind,
        id,
        base,
      ])
    : null;
}

export function readStored<T>(
  key: string | null,
  storage?: Pick<Storage, "getItem"> | "persistent",
): T | null {
  if (!key) return null;
  try {
    const source =
      storage === "persistent" ? localStorage : (storage ?? sessionStorage);
    return JSON.parse(source.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

export function store(
  key: string | null,
  value: unknown,
  storage?: Pick<Storage, "setItem"> | "persistent",
) {
  if (!key) return false;
  try {
    const source =
      storage === "persistent" ? localStorage : (storage ?? sessionStorage);
    source.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function forget(
  key: string | null,
  storage?: Pick<Storage, "removeItem"> | "persistent",
) {
  if (key) {
    try {
      const source =
        storage === "persistent" ? localStorage : (storage ?? sessionStorage);
      source.removeItem(key);
    } catch {
      /* Memory is cleared even when storage is unavailable. */
    }
  }
}

export function statusCode(error: unknown) {
  return (error as { status?: number } | null)?.status;
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function replacePrompt(payload: Record<string, unknown>, text: string) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const textBlocks = content.filter((block) => record(block).type === "text");
  if (textBlocks.map((block) => record(block).text ?? "").join("\n") === text)
    return payload;
  if (textBlocks.length > 1)
    throw new Error(
      "A structured prompt cannot be replaced by a single text field",
    );
  const next = content.map((block) =>
    record(block).type === "text" ? { ...record(block), text } : block,
  );
  if (textBlocks.length === 0) next.unshift({ type: "text", text });
  return { ...payload, content: next };
}
