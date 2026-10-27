// Restates the parts of `@cohub/protocol/app-navigation` v1 it uses; the runtime stays dependency-free.
const PROTOCOL = "cohub.app.navigation";
const VERSION = 1;
const MAX_ORIGINS = 8;
const MAX_REF_LENGTH = 2_048;
const RESPONSE_TIMEOUT_MS = 8_000;

type Host = { origin: string; targets: ReadonlySet<string> };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const isMessage = (value: unknown, type: string): value is Record<string, unknown> =>
  isRecord(value) && value.protocol === PROTOCOL && value.version === VERSION && value.type === type;

function httpOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value ? value : null;
  } catch {
    return null;
  }
}

function parseTargets(value: unknown): Set<string> | null {
  if (!isMessage(value, "intercept") || !Array.isArray(value.origins) || value.origins.length > MAX_ORIGINS) return null;
  const origins = value.origins.map(httpOrigin);
  return origins.every(Boolean) ? new Set(origins as string[]) : null;
}

const createRequestId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");

/** Offers same-tab navigations to parent-declared origins as an App `open`; unhandled ones resume. */
export function startRuntimeNavigation(): void {
  if (window.parent === window || !("navigation" in window)) return;
  const { navigation } = window;
  let host: Host | null = null;
  const pending = new Map<string, { origin: string; settle: (handled: boolean) => void }>();
  const resume = {};
  let latest: { href: string } | null = null;

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window.parent || httpOrigin(event.origin) !== event.origin) return;
    const targets = parseTargets(event.data);
    if (targets) {
      host = { origin: event.origin, targets };
      return;
    }
    if (!isMessage(event.data, "open.result")) return;
    const request = pending.get(String(event.data.requestId));
    if (request?.origin === event.origin) request.settle(event.data.handled === true);
  });

  const offer = (origin: string, ref: string) =>
    new Promise<boolean>((resolve) => {
      const requestId = createRequestId();
      const settle = (handled: boolean) => {
        window.clearTimeout(timer);
        pending.delete(requestId);
        resolve(handled);
      };
      const timer = window.setTimeout(() => settle(false), RESPONSE_TIMEOUT_MS);
      pending.set(requestId, { origin, settle });
      try {
        window.parent.postMessage(
          { protocol: PROTOCOL, version: VERSION, type: "open", requestId, target: { kind: "app", ref } },
          origin,
        );
      } catch {
        settle(false);
      }
    });

  navigation.addEventListener("navigate", (event) => {
    if (event.info === resume) return;
    const current = host;
    const url = new URL(event.destination.url);
    if (
      !current || !event.cancelable || event.hashChange ||
      typeof event.downloadRequest === "string" || event.formData ||
      (event.navigationType !== "push" && event.navigationType !== "replace") ||
      !current.targets.has(url.origin) || url.href.length > MAX_REF_LENGTH
    ) {
      if (!event.destination.sameDocument) latest = null;
      return;
    }
    event.preventDefault();
    if (latest?.href === url.href) return;
    const intent = { href: url.href };
    latest = intent;
    const history = event.navigationType;
    void offer(current.origin, url.href).then((handled) => {
      if (latest !== intent) return;
      latest = null;
      if (handled) return;
      const { committed, finished } = navigation.navigate(url.href, { history, info: resume });
      committed?.catch(() => undefined);
      finished?.catch(() => undefined);
    });
  });
}
