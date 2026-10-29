import type { HttpTransport } from "../transport.js";
import type {
  AcceptInvitationResponse,
  CreateInvitationInput,
  CreateInvitationResponse,
  InvitationDetail,
  SpaceInvitationListOptions,
  SpaceInvitationListResponse,
} from "../types.js";

export class SpaceInvitationsApi {
  constructor(
    private readonly transport: HttpTransport,
    private readonly spaceId: string,
  ) {}

  list(options: SpaceInvitationListOptions = {}) {
    const query = new URLSearchParams();
    if (options.status) query.set("status", options.status);
    if (options.limit !== undefined) query.set("limit", String(options.limit));
    if (options.cursor) query.set("cursor", options.cursor);
    const search = query.toString();
    return this.transport.request<SpaceInvitationListResponse>(
      `/api/spaces/${this.spaceId}/invitations${search ? `?${search}` : ""}`,
    );
  }

  create(input?: CreateInvitationInput) {
    return this.transport.request<CreateInvitationResponse>(
      `/api/spaces/${this.spaceId}/invitations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input ?? {}),
      },
    );
  }

  revoke(token: string) {
    return this.transport.request<{ ok: true }>(
      `/api/spaces/${this.spaceId}/invitations/${encodeURIComponent(token)}`,
      { method: "DELETE" },
    );
  }
}

export class PublicInviteApi {
  constructor(private readonly transport: HttpTransport) {}

  get(token: string) {
    return this.transport.request<InvitationDetail>(
      `/api/invite/${encodeURIComponent(token)}`,
    );
  }

  accept(token: string) {
    return this.transport.request<AcceptInvitationResponse>(
      `/api/invite/${encodeURIComponent(token)}/accept`,
      {
        method: "POST",
      },
    );
  }
}

export type BuildSpacePathInput = {
  spaceId: string;
  ownerUsername?: string | null;
  spaceSlug?: string | null;
};

export type BuildSpaceInvitePathInput = BuildSpacePathInput & {
  inviteCode: string;
};

function requiredPathSegment(value: string, label: string): string {
  const segment = typeof value === "string" ? value.trim() : "";
  if (!segment) throw new TypeError(`${label} is required`);
  return encodeURIComponent(segment);
}

export function buildSpacePath(input: BuildSpacePathInput): string {
  const username = input.ownerUsername?.trim();
  const slug = input.spaceSlug?.trim();
  if (username && slug) {
    return `/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`;
  }
  return `/spaces/${requiredPathSegment(input.spaceId, "spaceId")}`;
}

export function buildSpaceInvitePath(input: BuildSpaceInvitePathInput): string {
  const inviteCode = requiredPathSegment(input.inviteCode, "inviteCode");
  return `${buildSpacePath(input)}/join/${inviteCode}`;
}
