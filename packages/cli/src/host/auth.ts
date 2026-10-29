import { mkdirSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname } from "node:path";
import { HOST_SERVICE_SHELL_EVENTS, hostAuthChangedSchema, hostShellOpenSchema } from "@neta-art/cohub/host-bridge";
import {
  AuthRequiredError,
  authSessionPath,
  pollDeviceCode,
  readAuthSession,
  requestDeviceCode,
  resolveAccessToken,
  revokeAndClearAuthSession,
} from "../auth.js";
import { clearHomeSpaceCache, jwtClaim } from "../space.js";
import type { HostEmit } from "./serve.js";

type Snapshot = { subject: string | null; revision: string | null };

function snapshot(): Snapshot {
  const session = readAuthSession();
  if (!session) return { subject: null, revision: null };
  return {
    subject: jwtClaim(session.idToken, "sub") ?? jwtClaim(session.accessToken, "sub"),
    revision: `${session.updatedAt}:${session.refreshToken}`,
  };
}

export class HostAuth {
  #current = snapshot();
  #version = 0;
  #watcher: FSWatcher | null = null;
  #debounce: NodeJS.Timeout | undefined;
  #rewatch: NodeJS.Timeout | undefined;
  #pending: { url: string; expiresAt: number; redirectPath?: string } | null = null;

  constructor(
    private readonly emit: HostEmit,
    private readonly onAccountChanged: () => void,
  ) {}

  watch() {
    const path = authSessionPath();
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.#watcher = watch(dirname(path), (_event, name) => {
      if (name && name !== basename(path)) return;
      clearTimeout(this.#debounce);
      this.#debounce = setTimeout(() => this.#sync(), 50);
    });
    this.#watcher.once("error", () => {
      this.#watcher?.close();
      this.#rewatch = setTimeout(() => this.watch(), 1_000).unref();
    });
  }

  close() {
    clearTimeout(this.#debounce);
    clearTimeout(this.#rewatch);
    this.#watcher?.close();
  }

  get subject() {
    return this.#current.subject;
  }

  async accessToken(forceRefresh = false): Promise<string | null> {
    try {
      return await resolveAccessToken({ forceRefresh });
    } catch (error) {
      if (error instanceof AuthRequiredError) return null;
      throw error;
    }
  }

  sessionVersion() {
    return this.#version;
  }

  session() {
    const { subject } = snapshot();
    return { authenticated: subject !== null, userUuid: null, subject, email: null };
  }

  async signIn(redirectPath?: string): Promise<boolean> {
    const destination = hostAuthChangedSchema.shape.redirectPath.safeParse(redirectPath).data;
    if (this.#pending && this.#pending.expiresAt > Date.now()) {
      this.#pending.redirectPath = destination;
      this.#open(this.#pending.url);
      return true;
    }
    const code = await requestDeviceCode();
    const pending = { url: code.verificationUriComplete, expiresAt: code.expiresAt, redirectPath: destination };
    this.#pending = pending;
    this.#open(pending.url);
    void pollDeviceCode(code)
      .then(() => this.#sync({ redirectPath: pending.redirectPath, signedIn: true }))
      .catch((error: unknown) => process.stderr.write(`Sign-in did not complete: ${error instanceof Error ? error.message : String(error)}\n`))
      .finally(() => { if (this.#pending === pending) this.#pending = null; });
    return true;
  }

  async signOut(): Promise<boolean> {
    await revokeAndClearAuthSession();
    clearHomeSpaceCache();
    this.#sync();
    this.emit("auth.signedOut");
    return true;
  }

  #open(url: string) {
    this.emit(HOST_SERVICE_SHELL_EVENTS.open, hostShellOpenSchema.parse({ url }));
  }

  #sync({ redirectPath, signedIn = false }: { redirectPath?: string; signedIn?: boolean } = {}) {
    const next = snapshot();
    const accountChanged = next.subject !== this.#current.subject;
    if (next.revision !== this.#current.revision || accountChanged) this.#version += 1;
    this.#current = next;
    if (accountChanged) this.onAccountChanged();
    if (!accountChanged && !signedIn) return;
    this.emit("auth.changed", hostAuthChangedSchema.parse({ authenticated: next.subject !== null, ...(redirectPath ? { redirectPath } : {}) }));
  }
}
