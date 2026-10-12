import { mountResourceApp } from "../../shared/src/mount";

mountResourceApp("task", () => import("./App.svelte"));
