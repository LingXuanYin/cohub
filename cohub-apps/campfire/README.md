# Campfire

A fire in a night meadow that people sit around together. Walk up to someone
and you hear them; walk away together and you can talk on your own. Feed the
fire and its circle grows. Wake the fire spirit for a story, or play
draw-and-guess while the voices stay live underneath.

Campfire is the showcase for App rooms and their WebRTC layer. It is a
standalone Svelte App built on public packages, so the directory can be copied
out of this repository and developed on its own.

## What it demonstrates

| Capability | Where it shows |
| --- | --- |
| `room.rtc()` peer channels | Poses on a `latest` binary channel (7 bytes, up to 15 Hz), reactions and pen strokes on `reliable` channels |
| Media tracks | Microphone and camera published in one negotiation; camera and screen with simulcast |
| `rtc.select()` | Only the people you could hear are received; shared screens and anyone talking come first, 16 tracks at most |
| `setQuality()` | Cameras sharpen as people walk closer; an enlarged screen asks for the top layer |
| Proximity audio | Remote voices panned and attenuated by distance in WebAudio; everyone at the fire shares one conversation |
| Room events and history | Chat, firewood, the spirit's lines and the whole game are room events; a late joiner replays the evening |
| Room order as referee | The first summon wins; the first correct guess wins; no server code |
| `room.invite()` | The fire spirit joins as an outside member; the terminal button copies `cohub rooms join <invite>` |
| Devices | `<meta name="cohub:devices" content="microphone camera screen">` and `client.app.devices.request()`, surviving the grant reload |
| App Actions | The spirit is `.cohub/actions/spirit.ts`, running as the App owner, who pays for its words and voice |
| Degradation | Without WebRTC or a relay, poses and strokes fall back to `room.send`; walking, chat and the game keep working |

## How it is put together

```
src/
  fire.svelte.ts     The App: phases, routing room events, the frame loop
  net.ts             One connection: room, peer channels, media selection, relay fallback
  media.svelte.ts    Devices, publishing, receiving, spatial mix, simulcast quality
  spirit.svelte.ts   Summoning, watching the Action, playing the spirit's voice
  sketch.svelte.ts   What a client does about the game: pick, judge, sync the board
  game.ts            The game's rules: a pure reducer over room events, and duties
  pose.ts            Pose frames, interpolation, hearing distance and volume
  audio.ts           WebAudio mixer, level meter, and the media selection policy
  ink.ts             Pen strokes as a compact binary format
  meadow.ts world.ts The simulated meadow and its terrain
  ui/                Canvas scene, DOM bodies, lobby, dock, panels
spirit/              The fire spirit App Action, shipped as .cohub/actions/
preview/             A stand-in host for local development (not built)
```

Two rules keep it honest:

- **Frequent and disposable goes peer to peer; anything that must survive goes
  through the room.** A pose that is lost is replaced by the next one. A guess
  that is lost would change who won, so guesses are room events.
- **Every client derives the same state from the same events.** The fire's size
  is the decayed sum of the firewood events; the game is a reducer over the
  game events. There is nothing to reconcile after a reconnect, only to replay.

## Costs

The App owner pays for the fire spirit: each visit is a handful of short
completions and text-to-speech clips, and is bounded to 24 lines and 25 minutes,
leaving early when the fire empties or falls silent (`spirit/lib/mind.ts`).
Viewers pay nothing and grant nothing beyond their devices. The relay is part of
the platform.

## Develop

```bash
cd cohub-apps/campfire
npm install
npm run dev     # http://localhost:5173/preview.html
```

`preview.html` runs the App against a stand-in host: open it in two tabs of one
browser and the tabs share a room through a `BroadcastChannel`, with a scripted
fire spirit. There is no relay there, so it shows the fallback path. To drive
two campers from a headless browser:

```bash
./preview/seat-two.sh http://localhost:5173/preview.html
```

The real runtime — WebRTC, devices, the spirit Action — only works inside a
published App. Verify everything local with:

```bash
npm run check   # typecheck, lint, unit tests, build
```

## Publish

```bash
npm run build
cohub apps publish campfire --dir cohub-apps/campfire/dist --visibility public
```

No app scopes are needed: rooms, peer channels, devices and Actions are
runtime capabilities. The spirit Action runs with the SDK bundled with the
sandbox's `cohub` CLI, which needs `@neta-art/cohub-cli` 10 or newer for
`client.rooms`.

Open the App from a Space and everyone in that Space meets at the same fire;
share `?room=<code>` to meet anywhere else.
