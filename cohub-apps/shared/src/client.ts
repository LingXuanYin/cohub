import {
  createCohubClient,
  resolveWebBaseUrl,
  type AppRecord,
  type CronJobRecord,
  type CheckpointRecord,
  type TaskRunDetailResponse,
} from "@neta-art/cohub";
import type { ResourceAppTarget } from "@cohub/protocol";
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
  if (resource.spaceId !== spaceId || resource.id !== target.id)
    throw new Error("Resource does not belong to the requested Space");
  return result;
}
