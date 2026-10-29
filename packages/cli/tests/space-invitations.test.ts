import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type {
  CreateInvitationInput,
  SpaceInvitationListResponse,
} from "@neta-art/cohub";
import { Command } from "commander";
import {
  InvalidSpaceInvitationCliOptionsError,
  parseSpaceInvitationCreateOptions,
  registerSpaceInvitations,
} from "../src/commands/space-invitations.js";

const originalWebUrl = process.env.COHUB_WEB_URL;

afterEach(() => {
  if (originalWebUrl === undefined) delete process.env.COHUB_WEB_URL;
  else process.env.COHUB_WEB_URL = originalWebUrl;
});

test("space invite CLI options map days and limits to API input", () => {
  assert.deepEqual(
    parseSpaceInvitationCreateOptions({
      role: "guest",
      days: "14",
      maxUses: "25",
    }),
    {
      role: "guest",
      ttlSeconds: 14 * 24 * 60 * 60,
      maxUses: 25,
    },
  );
});

test("space invite CLI options reject unsafe values", () => {
  assert.throws(
    () => parseSpaceInvitationCreateOptions({ role: "owner" }),
    InvalidSpaceInvitationCliOptionsError,
  );
  assert.throws(
    () => parseSpaceInvitationCreateOptions({ days: "31" }),
    InvalidSpaceInvitationCliOptionsError,
  );
  assert.throws(
    () => parseSpaceInvitationCreateOptions({ maxUses: "10001" }),
    InvalidSpaceInvitationCliOptionsError,
  );
});

test("spaces invites create prints the friendly invite URL", async () => {
  const program = new Command("cohub").option("-s, --space <id>");
  const spaces = program.command("spaces");
  let receivedInput: CreateInvitationInput | null = null;
  const listResponse: SpaceInvitationListResponse = {
    spaceId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    ownerUsername: "alice",
    spaceSlug: "research",
    items: [],
    pageInfo: { nextCursor: null, hasMore: false },
  };
  registerSpaceInvitations(spaces, {
    createClient: () => ({
      space: () => ({
        invitations: {
          list: async () => listResponse,
          create: async (input) => {
            receivedInput = input;
            return {
              id: "5f0f8a3e-1d0b-4c43-9b1e-2a3e0f6f8d11",
              token: "inv_code",
              role: "builder",
              status: "active",
              useCount: 0,
              createdBy: "host",
              createdAt: "2026-08-03T00:00:00.000Z",
              expiresAt: "2026-08-10T00:00:00.000Z",
              expiresInSeconds: 604800,
              maxUses: null,
              spaceId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
              ownerUsername: "alice",
              spaceSlug: "research",
            };
          },
          revoke: async () => ({ ok: true }),
        },
      }),
    }),
  });

  process.env.COHUB_WEB_URL = "https://example.test/";
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => logs.push(values.join(" "));
  try {
    await program.parseAsync([
      "node",
      "cohub",
      "-s",
      "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "spaces",
      "invites",
      "create",
    ]);
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(receivedInput, {
    role: "builder",
    ttlSeconds: 7 * 24 * 60 * 60,
    maxUses: 0,
  });
  assert.match(
    logs.join("\n"),
    /https:\/\/example\.test\/alice\/research\/join\/inv_code/,
  );
});
