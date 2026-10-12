import type { ResourceAppKind } from "@cohub/protocol";
import type { TaskRunRecord } from "@neta-art/cohub";
import { client } from "./client";
import type { ResourceScope } from "./browser-route";

export type ResourceRow = {
  id: string;
  spaceId: string;
  title: string;
  subtitle?: string;
  status?:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "published"
    | "disabled"
    | "enabled";
  createdAt: string | null;
};
export type ResourcePage = { rows: ResourceRow[]; cursor: string | null };
export type TaskFilter = "all" | "active" | TaskRunRecord["status"];

export async function listResources(
  kind: ResourceAppKind,
  scope: ResourceScope,
  status: TaskFilter,
  cursor?: string | null,
): Promise<ResourcePage> {
  if (kind === "task") {
    const result = await client.tasks.list({
      ...(scope.kind === "space"
        ? { spaceId: scope.spaceId, sessionId: scope.sessionId }
        : {}),
      ...(status === "all" ? {} : { status }),
      limit: 30,
      ...(cursor ? { cursor } : {}),
    });
    return {
      rows: result.runs.flatMap((run) =>
        scope.kind === "mine" || run.spaceId === scope.spaceId
          ? [
              {
                id: run.id,
                spaceId: run.spaceId ?? "",
                title: run.taskType,
                status: run.status,
                createdAt: run.createdAt,
              },
            ]
          : [],
      ),
      cursor: result.pageInfo?.hasMore ? result.pageInfo.nextCursor : null,
    };
  }
  if (scope.kind !== "space") throw new Error("A Space is required");
  const spaceId = scope.spaceId;
  if (kind === "checkpoint") {
    const result = await client
      .space(spaceId)
      .checkpoints.list({ limit: 30, cursor });
    return {
      rows: result.checkpoints
        .filter((item) => item.spaceId === spaceId)
        .map((item) => ({
          id: item.id,
          spaceId,
          title: item.description || item.id.slice(0, 8),
          subtitle: item.commitHash.slice(0, 8),
          createdAt: item.createdAt,
        })),
      cursor: result.pageInfo?.hasMore ? result.pageInfo.nextCursor : null,
    };
  }
  if (kind === "cronjob") {
    const { jobs } = await client.cronJobs.list(spaceId);
    return {
      rows: jobs
        .filter((item) => item.spaceId === spaceId)
        .map((item) => ({
          id: item.id,
          spaceId,
          title: item.title,
          subtitle: `${item.cronExpression} · ${item.timezone}`,
          status: item.enabled ? "enabled" : "disabled",
          createdAt: item.createdAt,
        })),
      cursor: null,
    };
  }
  const { apps } = await client.apps.listBySpace(spaceId);
  return {
    rows: apps
      .filter((item) => item.spaceId === spaceId)
      .map((item) => ({
        id: item.id,
        spaceId,
        title: item.meta?.title ?? item.slug,
        subtitle: `v${item.latestVersion}`,
        status: item.status,
        createdAt: item.createdAt,
      })),
    cursor: null,
  };
}
