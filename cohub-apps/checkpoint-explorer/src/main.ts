import { mountResourceApp } from "../../shared/src/mount";

mountResourceApp("checkpoint", () => import("./App.svelte"));
