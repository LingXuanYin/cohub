import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist-mono/latin-400.css";
import { mount } from "svelte";
import App from "./App.svelte";
import "./styles.css";

import type { ResourceAppKind } from "@cohub/protocol";
import type { ResourceViewLoader } from "./view-types";

export function mountResourceApp(
  kind: ResourceAppKind,
  loadView: ResourceViewLoader,
) {
  const target = document.getElementById("app");
  if (!target) throw new Error("Missing App mount target");
  return mount(App, { target, props: { kind, loadView } });
}
