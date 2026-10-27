import type { AppRuntimeContext, CohubClient } from "@neta-art/cohub";
import type { AppHost } from "../app/app.ts";
import type { HostAppearance } from "./theme.ts";
import { createSdkFileClient } from "./sdk.ts";

function appearanceOf(context: AppRuntimeContext): HostAppearance {
  return {
    colorScheme: context.appearance?.colorScheme ?? "light",
    tokens: context.appearance?.tokens ?? {},
  };
}

/** The published-App host: the SDK's context, launches, title, dirty flag and close hook. */
export function createSdkHost(
  client: CohubClient,
  context: AppRuntimeContext,
  options: { readonly taskRunId: string | null } = { taskRunId: null },
): AppHost {
  let latest = context;
  const contextListeners = new Set<
    (next: { locale: string | null; appearance: HostAppearance }) => void
  >();
  const notifyContext = (next: AppRuntimeContext) => {
    latest = next;
    for (const listener of contextListeners) {
      listener({ locale: next.locale ?? null, appearance: appearanceOf(next) });
    }
  };
  client.app.onContextChanged(notifyContext);

  return {
    client: createSdkFileClient(client),
    initial: {
      locale: latest.locale ?? null,
      appearance: appearanceOf(latest),
      spaceId: latest.invocation?.spaceId ?? null,
      file:
        latest.invocation?.file && latest.invocation.spaceId
          ? { spaceId: latest.invocation.spaceId, path: latest.invocation.file.path }
          : null,
      taskRunId: options.taskRunId,
    },
    onLaunch(listener) {
      return client.app.onLaunch((launch) => listener(launch.file));
    },
    onContext(listener) {
      contextListeners.add(listener);
      return () => contextListeners.delete(listener);
    },
    setTitle(title) {
      client.app.window.setState({ title });
    },
    setDirty(dirty) {
      client.app.window.setState({ dirty });
    },
    onBeforeClose(handler) {
      client.app.window.onBeforeClose(handler);
    },
  };
}
