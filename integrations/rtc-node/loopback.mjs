import assert from "node:assert/strict";

import { setTimeout as delay } from "node:timers/promises";
import { AppRoomRtc } from "../../packages/sdk/src/apis/app-room-rtc.ts";
import { waitForIceGathering } from "../../packages/sdk/src/rtc/index.ts";
import { audioSource, videoSource, sink, createPeerConnection } from "./index.mjs";

const wait = async (condition) => {
  for (let i = 0; i < 400; i++) { if (condition()) return; await delay(10); }
  throw new Error("RTC loopback timed out");
};

export async function loopback() {
  const relay = createPeerConnection({ iceServers: [] });
  const control = relay.createDataChannel("server-events");
  const audio = audioSource();
  const video = videoSource({ width: 16, height: 16, fps: 30 });
  const remote = [];
  const received = [];
  let dataChannel;
  let incomingChannel;
  let members = [];
  const incomingAudio = audioSource();
  const incomingVideo = videoSource({ width: 16, height: 16 });
  relay.addEventListener("track", ({ track }) => remote.push(track));
  await relay.setLocalDescription(await relay.createOffer());
  await waitForIceGathering(relay, 2000);
  const rtc = new AppRoomRtc({
    roomId: "room", appId: "app", hosted: true, ticket: "unused",
    createPeerConnection, participantId: () => "agent", members: () => members, onMembersChanged: () => () => {},
    transport: { async request(path, options) {
      assert.ok(path.startsWith("/api/rooms/room/rtc"));
      const body = options?.body ? JSON.parse(options.body) : null;
      if (options?.method === "DELETE") return {};
      if (path === "/api/rooms/room/rtc") return { sessionId: "session", offer: { type: "offer", sdp: relay.localDescription.sdp }, iceServers: [] };
      if (options?.method === "PUT") { await relay.setRemoteDescription(body.answer); return {}; }
      if (path.endsWith("/publish") && body.channels) {
        dataChannel = relay.createDataChannel("chat", { negotiated: true, id: 4 });
        dataChannel.onmessage = (event) => received.push(event.data);
        return { publications: [{ id: "chat", name: "chat", kind: "data", delivery: "reliable" }], channelIds: { chat: 4 } };
      }
      if (path.endsWith("/publish") && body.tracks) {
        await relay.setRemoteDescription(body.offer);
        await relay.setLocalDescription(await relay.createAnswer());
        await waitForIceGathering(relay, 2000);
        return { publications: body.tracks.map((track) => ({ id: track.name, name: track.name, kind: track.kind })), answer: { type: "answer", sdp: relay.localDescription.sdp } };
      }
      if (path.endsWith("/subscribe") && body.kind === "data") {
        incomingChannel = relay.createDataChannel("chat-in", { negotiated: true, id: 6 });
        return { subscriptions: body.items.map((item) => ({ ...item, channelId: 6 })) };
      }
      if (path.endsWith("/subscribe") && body.kind === "media") {
        const senders = [relay.addTransceiver(incomingAudio.track, { direction: "sendonly" }).sender, relay.addTransceiver(incomingVideo.track, { direction: "sendonly" }).sender];
        await relay.setLocalDescription(await relay.createOffer());
        await waitForIceGathering(relay, 2000);
        return { subscriptions: body.items.map((item, i) => ({ ...item, mid: relay.getTransceivers().find((transceiver) => transceiver.sender === senders[i]).mid })), offer: { type: "offer", sdp: relay.localDescription.sdp } };
      }
      return {};
    } },
  });
  const stops = [];
  try {
    await rtc.start();
    const channel = rtc.channel("chat");
    await wait(() => dataChannel?.readyState === "open");
    assert.equal(channel.send({ hello: "world" }), true);
    await wait(() => received.length === 1);
    const data = Buffer.from(received[0]);
    assert.deepEqual(JSON.parse(data.subarray(5).toString()), { hello: "world" });
    await rtc.publish({ audio: audio.track, video: video.track });
    await wait(() => remote.length === 2);
    const frames = new Set();
    for (const track of remote) stops.push(sink(track, (frame) => { assert.ok(frame.data.length); frames.add(frame.format); }));
    for (let i = 0; i < 80 && frames.size < 2; i++) {
      audio.write(Buffer.alloc(audio.frameBytes));
      if (i % 3 === 0) video.write(Buffer.alloc(video.frameBytes));
      await delay(10);
    }
    assert.deepEqual([...frames].sort(), ["i420", "s16le"]);
    assert.equal(rtc.state, "connected");
    members = [{ participantId: "human", publications: [
      { id: "in-data", name: "chat", kind: "data", delivery: "reliable" },
      { id: "in-audio", name: "audio", kind: "audio" },
      { id: "in-video", name: "video", kind: "video" },
    ] }];
    const messages = [];
    channel.onMessage((message) => messages.push(message));
    rtc.select(null);
    await wait(() => rtc.tracks.length === 2 && incomingChannel?.readyState === "open");
    const payload = Buffer.from(JSON.stringify({ greeting: "hello" }));
    const frame = Buffer.alloc(5 + payload.length); frame.writeUInt32BE(1, 1); payload.copy(frame, 5);
    incomingChannel.send(frame);
    await wait(() => messages.length === 1);
    assert.deepEqual(messages[0], { from: "human", data: { greeting: "hello" } });
    const incomingFrames = new Set();
    for (const item of rtc.tracks) stops.push(sink(item.track, (frame) => incomingFrames.add(frame.format)));
    for (let i = 0; i < 80 && incomingFrames.size < 2; i++) {
      incomingAudio.write(Buffer.alloc(incomingAudio.frameBytes));
      if (i % 3 === 0) incomingVideo.write(Buffer.alloc(incomingVideo.frameBytes));
      await delay(10);
    }
    assert.deepEqual([...incomingFrames].sort(), ["i420", "s16le"]);
  } finally {
    for (const stop of stops) stop();
    incomingAudio.close(); incomingVideo.close();
    audio.close(); video.close(); await rtc.shutdown(); control.close(); relay.close();
  }
}
