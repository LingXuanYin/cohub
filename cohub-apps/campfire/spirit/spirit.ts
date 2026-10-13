import { readFileSync } from "node:fs";
import { createCohubClient, getCohubContext } from "@neta-art/cohub";
import {
  decide,
  greetingPrompt,
  type Heard,
  type Locale,
  NAME,
  type Pace,
  type Prompt,
  replyPrompt,
  storyPrompt,
  tidy,
  wonClaim,
} from "./lib/mind.ts";
import { Quota } from "./lib/quota.ts";
import { Voice } from "./lib/voice.ts";

const POLL_WAIT_MS = 20_000;
const LISTEN = ["campfire.chat", "spirit.dismiss"];

type Input = { invite: string; locale: Locale; by: string };
type Member = { participantId: string; kind?: string; presence?: Record<string, unknown> | null };

const log = (event: string, fields: Record<string, unknown> = {}) =>
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}\n`);

const readInput = (): Input => {
  const raw = JSON.parse(readFileSync(0, "utf8") || "null") as Partial<Input> | null;
  if (!raw || typeof raw.invite !== "string" || raw.invite.length > 4096) throw new Error("spirit: an invite is required");
  return {
    invite: raw.invite,
    locale: raw.locale === "zh" ? "zh" : "en",
    by: typeof raw.by === "string" ? raw.by.slice(0, 24) : "",
  };
};

const guestsOf = (members: Member[]) =>
  members
    .filter((member) => member.kind === "user")
    .map((member) => (typeof member.presence?.name === "string" ? member.presence.name.slice(0, 24) : ""))
    .filter(Boolean);

async function main() {
  const input = readInput();
  const client = createCohubClient();
  if (typeof client.rooms?.join !== "function") {
    throw new Error("spirit: this sandbox's Cohub SDK has no rooms; update it with `npm i -g @neta-art/cohub-cli`");
  }
  const execution = getCohubContext().execution;
  const spaceId = execution?.spaceId ?? process.env.COHUB_SPACE_ID ?? "";
  const run = crypto.randomUUID();

  const quota = new Quota(run, execution?.viewerUserId ?? "");
  const refusal = quota.claim();
  if (refusal) throw new Error(refusal);
  setInterval(() => quota.beat(), 30_000).unref();
  process.once("exit", () => quota.release());
  const presence = (thinking: boolean) => ({ role: "spirit", name: NAME[input.locale], color: "#ffb36b", thinking });

  const joined = await client.rooms.join({ invite: input.invite, presence: presence(true), idleSeconds: 600 });
  const roomId = joined.room.id;
  log("joined", { roomId, run });

  await client.rooms.publish(roomId, "spirit.awake", { run });
  const claim = await client.rooms.events(roomId, { after: Math.max(0, joined.sequence - 200), types: ["spirit.awake", "spirit.gone"], limit: 200 });
  if (!wonClaim(claim.events, run, Date.now())) {
    log("duplicate", { roomId });
    return;
  }

  const voice = new Voice(client, spaceId, input.locale);
  log("voice", { model: await voice.prepare() });

  const recent: Heard[] = [];
  const said: string[] = [];
  const pace: Pace = { spokeAt: 0, heardAt: 0, spoken: 0, startedAt: Date.now() };
  let cursor = claim.cursor;
  let chapter = 0;
  let members = joined.members as Member[];

  const think = async (prompt: Prompt) => {
    const completion = await client.space(spaceId).completion({
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      maxTokens: 400,
    });
    return tidy(completion.message.content.map((block) => (block.type === "text" ? block.text : "")).join(""));
  };

  const speak = async (prompt: Prompt, story: boolean) => {
    await client.rooms.setPresence(roomId, presence(true));
    let text = "";
    try {
      text = await think(prompt);
    } finally {
      await client.rooms.setPresence(roomId, presence(false)).catch(() => undefined);
    }
    if (!text) return;
    const id = `${run.slice(0, 8)}-${pace.spoken}`;
    await client.rooms.publish(roomId, "spirit.speak", { id, text, name: NAME[input.locale], story });
    said.push(text);
    pace.spoken += 1;
    pace.spokeAt = Date.now();
    const audio = await voice.speak(text).catch((error: unknown) => {
      log("voice_failed", { message: (error as Error).message });
      return null;
    });
    if (audio) await client.rooms.publish(roomId, "spirit.voice", { id, audio });
    pace.spokeAt = Date.now();
    log("spoke", { story, chars: text.length, voiced: Boolean(audio) });
  };

  const goodbye = async (reason: "idle" | "dismissed" | "empty" | "ended" | "failed") => {
    await client.rooms.publish(roomId, "spirit.gone", { reason }).catch(() => undefined);
    await client.rooms.leave(roomId).catch(() => undefined);
    log("left", { reason, lines: pace.spoken });
  };

  try {
    await speak(greetingPrompt(input.locale, input.by, guestsOf(members)), false);

    while (true) {
      const page = await client.rooms.events(roomId, { after: cursor, types: LISTEN, waitMs: POLL_WAIT_MS, limit: 100 });
      cursor = page.cursor;
      const addressed: Heard[] = [];
      for (const event of page.events) {
        if (event.self) continue;
        if (event.type === "spirit.dismiss") return await goodbye("dismissed");
        const data = event.data as { text?: unknown; name?: unknown; toSpirit?: unknown } | null;
        if (event.type !== "campfire.chat" || typeof data?.text !== "string") continue;
        const heard: Heard = {
          sequence: event.sequence,
          name: typeof data.name === "string" && data.name ? data.name.slice(0, 24) : "?",
          text: data.text.slice(0, 240),
          toSpirit: data.toSpirit === true,
          at: event.timestamp,
        };
        recent.push(heard);
        pace.heardAt = Date.now();
        if (heard.toSpirit) addressed.push(heard);
      }
      if (recent.length > 40) recent.splice(0, recent.length - 40);

      members = ((await client.rooms.get(roomId)).members ?? []) as Member[];
      const guests = guestsOf(members);
      if (guests.length === 0) return await goodbye("empty");

      const next = decide(pace, addressed, Date.now());
      if (!next) continue;
      if (next.kind === "leave") return await goodbye(next.reason);
      if (next.kind === "reply") await speak(replyPrompt(input.locale, guests, recent, next.lines, said), false);
      else await speak(storyPrompt(input.locale, guests, recent, said, chapter++), true);
    }
  } catch (error) {
    log("failed", { message: (error as Error).message });
    await goodbye("failed");
    process.exitCode = 1;
  }
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  log("fatal", { message });
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
