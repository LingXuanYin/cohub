import {
  createCohubClient,
  resolveWebBaseUrl,
  type AppRecord,
  type CronJobRecord,
  type CheckpointRecord,
  type TaskRunDetailResponse,
} from "@neta-art/cohub";
import {
  resourceAppRef,
  resourceAppLaunch,
  type ResourceAppTarget,
} from "@cohub/protocol";
import type { AppNavigationTarget } from "@cohub/protocol/app-navigation";
const environment = import.meta.env.VITE_COHUB_ENV === "dev" ? "dev" : "prod";
export const client = createCohubClient({ env: environment });
export function nativeResourceUrl(spaceId: string, target: ResourceAppTarget) {
  const segment = {
    task: "tasks",
    checkpoint: "checkpoints",
    cronjob: "cronjobs",
    app: "apps",
  }[target.kind];
  const url = new URL(
    `/spaces/${spaceId}/${segment}/${target.id}`,
    resolveWebBaseUrl({ env: environment }),
  );
  url.searchParams.set("native", "1");
  if (target.base) url.searchParams.set("base", target.base);
  return url.href;
}
export async function openRelated(
  target: AppNavigationTarget,
): Promise<string | null> {
  let resolved = target;
  let fallback: string | null = null;
  const web = resolveWebBaseUrl({ env: environment });
  if (
    target.kind === "task" ||
    target.kind === "checkpoint" ||
    target.kind === "cronjob"
  ) {
    const id =
      target.kind === "task"
        ? target.taskRunId
        : target.kind === "checkpoint"
          ? target.checkpointId
          : target.cronjobId;
    const resource = { kind: target.kind, id };
    const ref = resourceAppRef(resource);
    const launch = resourceAppLaunch(target.spaceId, resource);
    resolved = { kind: "app", ref, launch };
    const [owner, space, app] = ref.split("/");
    fallback = `${web}/${owner}/${space}/w/${app}${launch.hash}`;
  } else if (target.kind === "session") {
    fallback = `${web}/spaces/${encodeURIComponent(target.spaceId)}/sessions/${encodeURIComponent(target.sessionId)}`;
  }
  const result = await client.navigation.open(resolved).catch(() => null);
  if (result?.handled) return null;
  if (fallback) return fallback;
  if (target.kind === "app")
    return (await client.apps.getPublicById(target.ref)).publicUrl;
  throw new Error("Navigation is unavailable");
}

export type ResourceDetail =
  | { kind: "task"; data: TaskRunDetailResponse }
  | { kind: "checkpoint"; data: CheckpointRecord }
  | { kind: "cronjob"; data: CronJobRecord }
  | { kind: "app"; data: AppRecord };

export async function loadResource(
  spaceId: string,
  target: ResourceAppTarget,
): Promise<ResourceDetail> {
  let result: ResourceDetail;
  switch (target.kind) {
    case "task":
      result = { kind: "task", data: await client.tasks.get(target.id) };
      break;
    case "checkpoint":
      result = {
        kind: "checkpoint",
        data: (await client.space(spaceId).checkpoints.get(target.id))
          .checkpoint,
      };
      break;
    case "cronjob":
      result = {
        kind: "cronjob",
        data: (await client.cronJobs.get(target.id)).job,
      };
      break;
    case "app":
      result = { kind: "app", data: (await client.apps.get(target.id)).app };
      break;
  }
  const resource = result.kind === "task" ? result.data.run : result.data;
  if ((resource.spaceId ?? "") !== spaceId || resource.id !== target.id)
    throw new Error("Resource does not belong to the requested Space");
  return result;
}
