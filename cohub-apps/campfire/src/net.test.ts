import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CohubClient, RealtimeRoomMember } from "@neta-art/cohub";
import { FireSession, type Member, type RoomLogEvent } from "./net";
import { encodePose } from "./pose";

type Event = { type: string; data: unknown; timestamp: number; sequence: number; sender: { participantId: string }; self: boolean };

const fakeRoom = (history: Event[], members: RealtimeRoomMember[], onPresence: () => void = () => undefined) => {
  let listener: (event: Event) => void = () => undefined;
  let release: () => void = () => undefined;
  const sent: Array<{ type: string; data: unknown }> = [];
  const historyGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const room = {
    id: "room",
    participantId: "me",
    members,
    subscribeAll: (handler: (event: Event) => void) => {
      listener = handler;
      return () => true;
    },
    onMembersChanged: () => () => true,
    onStateChange: () => () => true,
    onOutOfSync: () => () => true,
    setPresence: async () => onPresence(),
    send: (type: string, data: unknown) => sent.push({ type, data }),
    publish: async () => undefined,
    history: async ({ after = 0 }: { after?: number }) => {
      await historyGate;
      return { events: history.filter((event) => event.sequence > after), cursor: 0, truncated: false };
    },
  };
  const client = { app: { realtime: { joinRoom: async () => room, createRoom: async () => room } } } as unknown as CohubClient;
  return { client, emit: (event: Event) => listener(event), releaseHistory: () => release(), sent };
};

const event = (sequence: number, type = "campfire.chat", sender = "other"): Event => ({
  type,
  data: { text: String(sequence) },
  timestamp: sequence,
  sequence,
  sender: { participantId: sender },
  self: false,
});

const presence = { name: "Me", color: "#f4a261", playing: false, mic: false, cam: false, screen: false, x: 0, y: 0 };

const session = (client: CohubClient, seen: RoomLogEvent[], poses: string[] = [], roster: Member[][] = []) =>
  new FireSession(client, "FIRE", presence, {
    onMembers: (members) => roster.push(members),
    onTracks: () => undefined,
    onConnection: () => undefined,
    onEvent: (item) => seen.push(item),
    onPose: (from) => poses.push(from),
    onEmote: () => undefined,
    onInk: () => undefined,
    onReset: () => undefined,
    onNotice: () => undefined,
    planMedia: () => new Set(),
  });

const member = (participantId: string, channels: boolean): RealtimeRoomMember => ({
  participantId,
  joinedAt: "2026-10-13T00:00:00Z",
  presence: null,
  kind: "user",
  publications: channels ? [{ id: "p1", name: "pose", kind: "data", delivery: "latest" }] : [],
});

describe("joining a room", () => {
  it("replays history before live events that arrived while it loaded", async () => {
    const room = fakeRoom([event(1), event(2), event(3)], [member("me", false)]);
    const seen: RoomLogEvent[] = [];
    const fire = session(room.client, seen);
    const joining = fire.join();
    await new Promise((resolve) => setTimeout(resolve, 0));
    room.emit(event(5));
    room.emit(event(4));
    room.releaseHistory();
    await joining;
    fire.dispose();
    assert.deepEqual(seen.map((item) => item.sequence), [1, 2, 3, 4, 5]);
  });

  it("keeps history when a live event lands before history is even asked for", async () => {
    let emitLive: () => void = () => undefined;
    const room = fakeRoom([event(1), event(2)], [member("me", false)], () => emitLive());
    emitLive = () => room.emit(event(3));
    room.releaseHistory();
    const seen: RoomLogEvent[] = [];
    const fire = session(room.client, seen);
    await fire.join();
    fire.dispose();
    assert.deepEqual(seen.map((item) => item.sequence), [1, 2, 3]);
  });

  it("delivers each event once, even if history and live overlap", async () => {
    const room = fakeRoom([event(1), event(2)], [member("me", false)]);
    const seen: RoomLogEvent[] = [];
    const fire = session(room.client, seen);
    const joining = fire.join();
    await new Promise((resolve) => setTimeout(resolve, 0));
    room.emit(event(2));
    room.releaseHistory();
    await joining;
    room.emit(event(3));
    fire.dispose();
    assert.deepEqual(seen.map((item) => item.sequence), [1, 2, 3]);
  });
});

describe("the relay lane", () => {
  it("sends poses through the room when there are no peer channels", async () => {
    const room = fakeRoom([], [member("me", false), member("other", false)]);
    room.releaseHistory();
    const fire = session(room.client, []);
    await fire.join();
    fire.sendPose({ x: 1, y: 2, angle: 0, level: 0, moving: true, talking: false, mic: false, cam: false });
    fire.dispose();
    assert.equal(room.sent.filter((item) => item.type === "pose").length, 1);
  });

  it("reads poses that arrive through the room, but never its own", async () => {
    const room = fakeRoom([], [member("me", false), member("other", false)]);
    room.releaseHistory();
    const poses: string[] = [];
    const fire = session(room.client, [], poses);
    await fire.join();
    const b = Buffer.from(encodePose({ x: 1, y: 2, angle: 0, level: 0, moving: false, talking: false, mic: false, cam: false })).toString("base64");
    room.emit({ ...event(1, "pose", "other"), data: { b } });
    room.emit({ ...event(2, "pose", "me"), data: { b }, self: true });
    fire.dispose();
    assert.deepEqual(poses, ["other"]);
  });

  it("keeps relay traffic out of the room log", async () => {
    const room = fakeRoom([], [member("me", false)]);
    room.releaseHistory();
    const seen: RoomLogEvent[] = [];
    const fire = session(room.client, seen);
    await fire.join();
    room.emit({ ...event(1, "emote"), data: { emoji: "🔥" } });
    fire.dispose();
    assert.equal(seen.length, 0);
  });
});

describe("the fire spirit", () => {
  it("is only ever a seat taken through the platform, never a viewer claiming the role", async () => {
    const claim = (participantId: string, kind: "user" | "cli"): RealtimeRoomMember => ({
      ...member(participantId, false),
      kind,
      presence: { role: "spirit", name: participantId },
    });
    const room = fakeRoom([], [member("me", false), claim("joker", "user"), claim("ember", "cli")]);
    room.releaseHistory();
    const roster: Member[][] = [];
    const fire = session(room.client, [], [], roster);
    await fire.join();
    fire.dispose();
    const spirits = (roster.at(-1) ?? []).filter((item) => item.spirit).map((item) => item.participantId);
    assert.deepEqual(spirits, ["ember"]);
  });
});

describe("losing sync while reading history", () => {
  it("starts over from the beginning instead of resuming where the stale read was", async () => {
    const all = Array.from({ length: 201 }, (_, index) => event(index + 1));
    const calls: Array<{ after: number; resolve: (events: Event[]) => void }> = [];
    let outOfSync: () => void = () => undefined;
    const room = {
      id: "room",
      participantId: "me",
      members: [member("me", false)],
      subscribeAll: () => () => true,
      onMembersChanged: () => () => true,
      onStateChange: () => () => true,
      onOutOfSync: (handler: () => void) => {
        outOfSync = handler;
        return () => true;
      },
      setPresence: async () => undefined,
      send: () => undefined,
      history: ({ after = 0 }: { after?: number }) =>
        new Promise<{ events: Event[] }>((resolve) => calls.push({ after, resolve: (events) => resolve({ events }) })),
    };
    const client = { app: { realtime: { joinRoom: async () => room } } } as unknown as CohubClient;
    const seen: RoomLogEvent[] = [];
    let resets = 0;
    const fire = new FireSession(client, "FIRE", presence, {
      onMembers: () => undefined,
      onTracks: () => undefined,
      onConnection: () => undefined,
      onEvent: (item) => seen.push(item),
      onPose: () => undefined,
      onEmote: () => undefined,
      onInk: () => undefined,
      onReset: () => {
        resets += 1;
        seen.length = 0;
      },
      onNotice: () => undefined,
      planMedia: () => new Set(),
    });
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const answer = async (index: number) => {
      await tick();
      const call = calls[index];
      assert.ok(call, `history call ${index}`);
      call.resolve(all.filter((item) => item.sequence > call.after).slice(0, 200));
    };

    try {
      const joining = fire.join();
      await answer(0);
      await tick();
      outOfSync();
      await answer(1);
      await answer(2);
      await answer(3);
      await joining;
      await tick();
    } finally {
      fire.dispose();
    }

    assert.equal(resets, 1);
    assert.deepEqual(calls.map((call) => call.after), [0, 200, 0, 200]);
    assert.deepEqual(seen.map((item) => item.sequence), all.map((item) => item.sequence));
  });
});
