import { mountResourceApp } from "../../shared/src/mount";

mountResourceApp("cronjob", () => import("./App.svelte"));
