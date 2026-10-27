import { COHUB_APP_ORIGINS } from "@neta-art/cohub";

/** Studio serves the dev App under `/dev/` and the prod App at the root. */
export const STUDIO_ORIGINS = {
  dev: "https://dev-studio.neta.art",
  prod: "https://neta.art",
} as const;

export type AppEnvironment = keyof typeof STUDIO_ORIGINS;

/**
 * `allowHostOrigins` replaces the SDK's default trusted list, so it has to name
 * Cohub's own origins and the Studio that serves this environment.
 */
export const hostOriginsFor = (env: AppEnvironment): string[] => [
  ...COHUB_APP_ORIGINS,
  STUDIO_ORIGINS[env],
];
