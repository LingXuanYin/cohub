import { createCohubClient } from "@neta-art/cohub";
import "./app/styles.css";
import { createApp } from "./app/app.ts";
import { frameCopy, languageFor } from "./app/copy.ts";
import { createSdkHost } from "./host/sdk-host.ts";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("The App page has no #app element.");

const isDev = location.pathname.startsWith("/dev/") || location.hostname.includes("dev");
const client = createCohubClient({ env: isDev ? "dev" : "prod" });
const context = await client.context();

if (context === null) {
  const language = languageFor(navigator.language);
  const copy = frameCopy(language);
  const panel = document.createElement("section");
  panel.className = "frame-state";
  const title = document.createElement("h1");
  title.className = "frame-state-title";
  title.textContent = copy.noHostTitle;
  const body = document.createElement("p");
  body.className = "frame-state-body";
  body.textContent = copy.noHostBody;
  panel.append(title, body);
  const shell = document.createElement("div");
  shell.className = "frame";
  shell.append(panel);
  root.append(shell);
} else {
  client.app.appearance.sync(document.documentElement);
  createApp({ root, host: createSdkHost(client, context) });
}
