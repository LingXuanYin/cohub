import type { Component } from "svelte";
import type { Permission } from "@neta-art/cohub";
import type { ResourceAppTarget } from "@cohub/protocol";
import type { ResourceDetail } from "./client";
import type { Locale } from "./i18n";
export type ResourceViewLoader = () => Promise<{
  default: Component<ViewProps>;
}>;
export type ViewProps = {
  target: ResourceAppTarget;
  spaceId: string;
  detail: ResourceDetail | null;
  locale: Locale;
  busy: boolean;
  draft: Record<string, unknown> | null;
  action: (
    scopes: Permission[],
    run: () => Promise<void>,
    write?: boolean,
  ) => Promise<boolean>;
  authorize: (scopes: Permission[]) => Promise<boolean>;
  updateDraft: (draft: Record<string, unknown> | null) => void;
  refresh: () => Promise<void>;
};
