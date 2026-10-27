import assert from "node:assert/strict";
import { test } from "node:test";
import { COHUB_APP_ORIGINS } from "@neta-art/cohub";
import { hostOriginsFor } from "../src/host/origins.ts";

const STUDIO_ORIGINS = {
  dev: "https://dev-studio.neta.art",
  prod: "https://neta.art",
} as const;

for (const env of ["dev", "prod"] as const) {
  test(`${env}: every Cohub origin plus that environment's Studio origin`, () => {
    const origins = hostOriginsFor(env);
    for (const origin of COHUB_APP_ORIGINS) {
      assert.ok(origins.includes(origin), `${env} misses ${origin}`);
    }
    assert.ok(origins.includes(STUDIO_ORIGINS[env]), `${env} misses its Studio origin`);
    const other = env === "dev" ? "prod" : "dev";
    assert.ok(!origins.includes(STUDIO_ORIGINS[other]), `${env} allows the other Studio origin`);
    assert.equal(new Set(origins).size, origins.length, "origins repeat");
  });
}
