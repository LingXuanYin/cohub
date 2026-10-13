import type { AppDevice } from "@neta-art/cohub";
import { LevelMeter, mediaKey, qualityFor, selectMedia, VoiceMixer } from "./audio";
import type { Campfire } from "./fire.svelte";
import type { RemoteTrack } from "./net";
import { hearingDistance, voiceVolume } from "./pose";
import { MEADOW_RADIUS, mediaTracks } from "./protocol";

type Quality = "low" | "medium" | "high";

const QUALITY_INTERVAL_MS = 600;
const spiritVolume = (distance: number) => Math.max(0.3, Math.min(1, 1 - distance / 30));

export class Media {
  mic = $state(false);
  cam = $state(false);
  screen = $state(false);
  tracks = $state.raw<RemoteTrack[]>([]);
  localCam = $state.raw<MediaStreamTrack | null>(null);
  localScreen = $state.raw<MediaStreamTrack | null>(null);
  stage = $state<string | null>(null);
  level = 0;

  private readonly fire: Campfire;
  private mixer: VoiceMixer | null = null;
  private meter: LevelMeter | null = null;
  private micTrack: MediaStreamTrack | null = null;
  private pending = new Map<string, MediaStreamTrack | { track: MediaStreamTrack; simulcast: boolean }>();
  private qualities = new Map<string, Quality>();
  private qualityAt = 0;

  constructor(fire: Campfire) {
    this.fire = fire;
  }

  get screens() {
    const remote = this.tracks
      .filter((track) => track.name === mediaTracks.screen && track.kind === "video")
      .map((track) => ({ participantId: track.participantId, track: track.track }));
    const own = this.localScreen && this.fire.session ? [{ participantId: this.fire.session.participantId, track: this.localScreen }] : [];
    return [...own, ...remote];
  }

  cameraOf(participantId: string, self: boolean): MediaStreamTrack | null {
    if (self) return this.localCam;
    return this.tracks.find((track) => track.participantId === participantId && track.name === mediaTracks.cam)?.track ?? null;
  }

  async start(want: { mic: boolean; cam: boolean }) {
    this.mixer ??= new VoiceMixer();
    void this.mixer.resume();
    if (want.mic) await this.toggleMic();
    if (want.cam) await this.toggleCam();
  }

  wake() {
    void this.mixer?.resume();
  }

  async toggleMic() {
    if (this.micTrack) {
      this.mic = !this.mic;
      this.micTrack.enabled = this.mic;
      this.fire.pushPresence(true);
      return;
    }
    if (!(await this.request("microphone"))) return;
    const stream = await navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .catch(() => null);
    const track = stream?.getAudioTracks()[0];
    if (!stream || !track) return this.fire.say(this.fire.t.micUnavailable);
    this.micTrack = track;
    this.mixer ??= new VoiceMixer();
    this.meter = new LevelMeter(this.mixer.context, stream);
    this.mic = true;
    await this.publish(mediaTracks.mic, track);
    this.fire.pushPresence(true);
  }

  async toggleCam() {
    if (this.localCam) {
      this.localCam.stop();
      this.localCam = null;
      this.cam = false;
      this.pending.delete(mediaTracks.cam);
      await this.fire.session?.stopTrack(mediaTracks.cam);
      this.fire.pushPresence(true);
      return;
    }
    if (!(await this.request("camera"))) return;
    const stream = await navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 640 }, frameRate: { ideal: 20, max: 24 }, facingMode: "user" } })
      .catch(() => null);
    const track = stream?.getVideoTracks()[0];
    if (!track) return this.fire.say(this.fire.t.camUnavailable);
    this.localCam = track;
    this.cam = true;
    track.addEventListener("ended", () => {
      if (this.localCam === track) void this.toggleCam();
    });
    await this.publish(mediaTracks.cam, { track, simulcast: true });
    this.fire.pushPresence(true);
  }

  async toggleScreen() {
    if (this.localScreen) {
      this.localScreen.stop();
      this.localScreen = null;
      this.screen = false;
      this.pending.delete(mediaTracks.screen);
      await this.fire.session?.stopTrack(mediaTracks.screen);
      this.fire.pushPresence(true);
      return;
    }
    if (!this.fire.session?.peerReady) return this.fire.say(this.fire.t.voicesDown);
    if (!(await this.request("screen"))) return;
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 12, max: 15 } }, audio: false }).catch(() => null);
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    track.contentHint = "detail";
    this.localScreen = track;
    this.screen = true;
    track.addEventListener("ended", () => {
      if (this.localScreen === track) void this.toggleScreen();
    });
    await this.publish(mediaTracks.screen, { track, simulcast: true });
    this.fire.pushPresence(true);
  }

  private async request(device: AppDevice) {
    if (device !== "screen") this.fire.remember({ mic: device === "microphone" || this.mic, cam: device === "camera" || this.cam });
    const status = await this.fire.client.app.devices.request([device]).catch(() => "unavailable" as const);
    this.fire.forget();
    if (status === "granted") return true;
    this.fire.say(status === "denied" ? this.fire.t.deviceDenied : this.fire.t.deviceUnavailable);
    return false;
  }

  private async publish(name: string, input: MediaStreamTrack | { track: MediaStreamTrack; simulcast: boolean }) {
    const session = this.fire.session;
    if (!session?.peerReady) {
      this.pending.set(name, input);
      return;
    }
    await session.publishTracks({ [name]: input }).catch(() => this.fire.say(this.fire.t.voicesDown));
  }

  async publishPending() {
    const session = this.fire.session;
    if (!session?.peerReady || this.pending.size === 0) return;
    const batch = Object.fromEntries(this.pending);
    this.pending.clear();
    await session.publishTracks(batch).catch(() => this.fire.say(this.fire.t.voicesDown));
  }

  onTracks(tracks: RemoteTrack[]) {
    this.tracks = tracks;
    const voices = new Map<string, MediaStreamTrack>();
    for (const track of tracks) if (track.kind === "audio") voices.set(track.participantId, track.track);
    this.mixer?.sync(voices);
    this.qualities = new Map([...this.qualities].filter(([key]) => tracks.some((track) => mediaKey(track.participantId, track.name) === key)));
    this.qualityAt = 0;
  }

  plan(candidates: Array<{ participantId: string; name: string; kind: "audio" | "video" }>) {
    const body = this.fire.meadow.self();
    const hearth = this.fire.meadow.hearth;
    return selectMedia(
      candidates.map((candidate) => {
        const actor = this.fire.meadow.actors.get(candidate.participantId);
        return {
          ...candidate,
          distance: body && actor ? hearingDistance(body, actor, hearth) : MEADOW_RADIUS,
          speaking: (actor?.level ?? 0) > 0.15,
          pinned: candidate.name === mediaTracks.screen,
        };
      }),
    );
  }

  frame() {
    this.level = this.mic && this.meter ? this.meter.read() : 0;
    const body = this.fire.meadow.self();
    if (!body || !this.mixer) return;
    const hearth = this.fire.meadow.hearth;
    const speakers = [];
    for (const actor of this.fire.meadow.actors.values()) {
      if (actor.self || actor.spirit) continue;
      speakers.push({ id: actor.participantId, x: actor.x, y: actor.y, volume: voiceVolume(hearingDistance(body, actor, hearth)) });
    }
    this.mixer.place(body, speakers);

    const now = performance.now();
    if (now - this.qualityAt > QUALITY_INTERVAL_MS) {
      this.qualityAt = now;
      this.applyQualities(body);
    }
  }

  private applyQualities(body: { x: number; y: number }) {
    for (const track of this.tracks) {
      if (track.kind !== "video") continue;
      const actor = this.fire.meadow.actors.get(track.participantId);
      const distance = actor ? Math.hypot(actor.x - body.x, actor.y - body.y) : MEADOW_RADIUS;
      const wanted: Quality =
        track.name === mediaTracks.screen ? (this.stage === track.participantId ? "high" : "medium") : qualityFor(distance);
      const key = mediaKey(track.participantId, track.name);
      if (this.qualities.get(key) === wanted) continue;
      this.qualities.set(key, wanted);
      track.setQuality(wanted);
    }
  }

  async playSpirit(url: string) {
    if (!this.mixer) return 0;
    void this.mixer.resume();
    return this.mixer.play(url, () => {
      const body = this.fire.meadow.self();
      return body ? spiritVolume(Math.hypot(body.x, body.y)) : 0.6;
    });
  }

  stop() {
    this.micTrack?.stop();
    this.localCam?.stop();
    this.localScreen?.stop();
    this.meter?.dispose();
    this.mixer?.dispose();
    this.micTrack = null;
    this.localCam = null;
    this.localScreen = null;
    this.meter = null;
    this.mixer = null;
    this.pending.clear();
    this.qualities.clear();
    this.tracks = [];
    this.mic = false;
    this.cam = false;
    this.screen = false;
    this.stage = null;
    this.level = 0;
  }
}
