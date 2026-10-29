import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Keep in sync with the instrumentations in packages/infra/src/tracing/provider.ts.
const INSTRUMENTED_MODULES = ["http", "https", "ioredis"];

const require = createRequire(import.meta.resolve("@opentelemetry/instrumentation"));
const { register }: { register(options: { include: string[] }): void } = await import(
  pathToFileURL(require.resolve("import-in-the-middle/register-hooks.mjs")).href
);

register({ include: INSTRUMENTED_MODULES });
