import { createCohubClient } from "@neta-art/cohub";
import "./app/styles.css";
import { createApp } from "./app/app.ts";
import { frameCopy, languageFor } from "./app/copy.ts";
import { stateCopy } from "./app/policy.ts";
import { createFrameView, type FrameView } from "./app/view.ts";
import { createSdkHost } from "./host/sdk-host.ts";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("The App page has no #app element.");

// Dev serves `<origin>/dev/w/…`; prod serves `<origin>/w/…`. One build serves both (decision 82).
const isDev = location.pathname.startsWith("/dev/");
const client = createCohubClient({ env: isDev ? "dev" : "prod" });

const language = () => languageFor(document.documentElement.lang || navigator.language);
document.documentElement.lang = language();
// Host tokens, color scheme and lang as early as the SDK can set them, before the context resolves.
client.app.appearance.sync(document.documentElement);

let standalone: FrameView | null = null;

function clearBoot(): void {
  document.querySelector("#boot")?.remove();
}

function showStandalone(state: "no-host" | "failed", retry?: () => void): void {
  clearBoot();
  standalone?.destroy();
  (root as HTMLElement).replaceChildren();
  const view = createFrameView(root as HTMLElement, language());
  standalone = view;
  view.setFile(null, null, false);
  if (state === "no-host") {
    view.showState(stateCopy("no-host", null, language()));
    return;
  }
  const copy = frameCopy(language());
  view.showState({
    title: copy.startupFailedTitle,
    body: copy.startupFailedBody,
    ...(retry === undefined ? {} : { action: { label: copy.retry, run: retry } }),
  });
}

async function start(): Promise<void> {
  try {
    const context = await client.context();
    if (context === null) {
      showStandalone("no-host");
      return;
    }
    standalone?.destroy();
    standalone = null;
    clearBoot();
    createApp({ root: root as HTMLElement, host: createSdkHost(client, context) });
  } catch {
    showStandalone("failed", () => void start());
  }
}

void start();
