import { mount } from "svelte";
import App from "../src/App.svelte";
import { Campfire } from "../src/fire.svelte";
import "../src/styles.css";
import { createPreviewClient } from "./client";

const target = document.getElementById("app");
if (!target) throw new Error("Missing app mount target");
const fire = new Campfire(createPreviewClient());
Object.assign(globalThis, { campfire: fire });
mount(App, { target, props: { fire } });
