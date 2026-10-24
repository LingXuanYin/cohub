// OSS-backed hosts keep OSS processing: cold video frames take ~0.2s there against 1–3s on Cloudflare.

export type MediaFit = "cover" | "contain" | "width";
export type MediaSize = { width: number; height: number };
export type MediaSource = { url: string; type: "image" | "video" };

export type MediaHost = {
  transform: "oss" | "cloudflare";
  metaHeaders?: boolean;
};

const MEDIA_HOSTS: ReadonlyMap<string, MediaHost> = new Map([
  ["router-files.neta.art", { transform: "oss", metaHeaders: true }],
  ["oss.talesofai.com", { transform: "oss" }],
  ["public.cohub.live", { transform: "oss" }],
  ["public.cohub.run", { transform: "oss" }],
  ["sessions.cohub.live", { transform: "oss" }],
  ["works.cohub.live", { transform: "oss" }],
  ["works.cohub.run", { transform: "oss" }],
  ["cca.neta.art", { transform: "cloudflare" }],
]);

const parseHttpsUrl = (url: string) => {
  if (!/^https:\/\//i.test(url)) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

export function mediaHost(url: string): MediaHost | undefined {
  const parsed = parseHttpsUrl(url);
  return parsed ? MEDIA_HOSTS.get(parsed.hostname) : undefined;
}

/** Fixed variant edges keep CDN cache hits high; pick one with `mediaVariantSize`. */
export const MEDIA_VARIANT_SIZES = [192, 384, 768, 1536] as const;
export const MEDIA_VARIANT_MAX = 1536;
export type MediaVariantSize = (typeof MEDIA_VARIANT_SIZES)[number];

/** Smallest variant covering `pixels` device pixels, capped at the largest. */
export function mediaVariantSize(pixels: number): MediaVariantSize {
  return MEDIA_VARIANT_SIZES.find((size) => size >= pixels) ?? MEDIA_VARIANT_MAX;
}

const VARIANT_QUALITY = 82;
const FRAME_GUESS_MAX = 768;

type Frame = { edge: number | null; fit: MediaFit; natural?: MediaSize | null; format: "jpg" | "png" };

type ImageFormat = "auto" | "webp";

type Adapter = {
  image: (url: string, edge: number, fit: MediaFit, quality: number, format: ImageFormat) => string | null;
  frame: (url: string, frame: Frame) => string | null;
  imageInfoUrl: (url: string) => string | null;
  readImageInfo: (body: unknown) => MediaInfo;
  source: (url: string) => MediaSource | null;
};

function fitted(natural: MediaSize, edge: number, fit: MediaFit): MediaSize {
  const bound = fit === "cover" ? Math.min(natural.width, natural.height) : fit === "width" ? natural.width : Math.max(natural.width, natural.height);
  const scale = Math.min(1, edge / bound);
  return { width: Math.max(1, Math.round(natural.width * scale)), height: Math.max(1, Math.round(natural.height * scale)) };
}

const guessedBox = (edge: number, fit: MediaFit) => (fit === "cover" ? edge * 2 : edge);

const OSS_PROCESS_PATTERN = /[?&]x-oss-process=/;

/** Append an OSS process to `url`, keeping its query and hash. */
export function ossProcessUrl(url: string, process: string): string {
  if (/^(data|blob):/i.test(url) || OSS_PROCESS_PATTERN.test(url)) return url;
  const hashIndex = url.indexOf("#");
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  return `${base}${base.includes("?") ? "&" : "?"}x-oss-process=${process}${hash}`;
}

const ossProcess = (url: string, process: string) => (OSS_PROCESS_PATTERN.test(url) ? null : ossProcessUrl(url, process));

const OSS_RESIZE: Record<MediaFit, (edge: number) => string> = {
  cover: (edge) => `m_mfit,w_${edge},h_${edge}`,
  contain: (edge) => `m_lfit,w_${edge},h_${edge}`,
  width: (edge) => `w_${edge}`,
};

const oss: Adapter = {
  image: (url, edge, fit, quality) => ossProcess(url, `image/resize,${OSS_RESIZE[fit](edge)}/quality,q_${quality}/format,webp`),
  frame: (url, { edge, fit, natural, format }) => {
    // OSS stretches frames given both edges, so only the width is set.
    const width = edge === null ? 0 : natural ? fitted(natural, edge, fit).width : Math.min(guessedBox(edge, fit), FRAME_GUESS_MAX);
    return ossProcess(url, `video/snapshot,t_0,f_${format},${width ? `w_${width}` : "w_0,h_0"},m_fast`);
  },
  imageInfoUrl: (url) => ossProcess(url, "image/info"),
  readImageInfo: (body) => {
    const fields = body as Record<string, { value?: unknown } | undefined>;
    return { width: positive(fields.ImageWidth?.value), height: positive(fields.ImageHeight?.value), bytes: positive(fields.FileSize?.value) };
  },
  // Only the process parameter is cut, so the rest of the URL (signed queries included) stays byte-for-byte.
  source: (url) => {
    const match = /([?&])x-oss-process=([^&#]*)/.exec(url);
    if (!match) return null;
    const [segment, separator, process = ""] = match;
    const head = url.slice(0, match.index);
    const tail = url.slice(match.index + segment.length);
    // A leading `?` passes to the next parameter, if any.
    const source = separator === "?" && tail.startsWith("&") ? `${head}?${tail.slice(1)}` : head + tail;
    return { url: source, type: process.startsWith("video/") ? "video" : "image" };
  },
};

const CLOUDFLARE_DERIVED = /^\/cdn-cgi\/(image|media)\/[^/]+(\/.*)$/;

function cdnCgi(url: string, kind: "image" | "media", options: string): string | null {
  const { origin, pathname, search } = new URL(url);
  return pathname.startsWith("/cdn-cgi/") ? null : `${origin}/cdn-cgi/${kind}/${options}${pathname}${search}`;
}

function cloudflareBox(edge: number, fit: MediaFit, natural?: MediaSize | null) {
  if (natural) return `width=${fitted(natural, edge, fit).width}`;
  if (fit === "width") return `width=${edge}`;
  const box = guessedBox(edge, fit);
  return `width=${box},height=${box}`;
}

const cloudflare: Adapter = {
  image: (url, edge, fit, quality, format) =>
    cdnCgi(url, "image", `${cloudflareBox(edge, fit)},fit=scale-down,quality=${quality},format=${format},onerror=redirect`),
  frame: (url, { edge, fit, natural, format }) =>
    cdnCgi(url, "media", `mode=frame,time=0s,${edge === null ? "" : `${cloudflareBox(edge, fit, natural)},fit=scale-down,`}format=${format}`),
  imageInfoUrl: (url) => cdnCgi(url, "image", "format=json"),
  readImageInfo: (body) => {
    const original = (body as { original?: Record<string, unknown> }).original;
    return { width: positive(original?.width), height: positive(original?.height), bytes: positive(original?.file_size) };
  },
  source: (url) => {
    const parsed = new URL(url);
    const match = CLOUDFLARE_DERIVED.exec(parsed.pathname);
    return match ? { url: `${parsed.origin}${match[2]}${parsed.search}${parsed.hash}`, type: match[1] === "media" ? "video" : "image" } : null;
  },
};

const ADAPTERS = { oss, cloudflare } as const;

function adapterFor(url: string): Adapter | null {
  const host = mediaHost(url);
  return host ? ADAPTERS[host.transform] : null;
}

const isGif = (url: string) => /\.gif$/i.test(new URL(url).pathname);

function resizedImageUrl(url: string, edge: number, fit: MediaFit, quality: number, format: ImageFormat): string | null {
  const adapter = adapterFor(url);
  // A converted GIF may lose its animation.
  return adapter && !isGif(url) ? adapter.image(url, edge, fit, quality, format) : null;
}

export function imageVariantUrl(url: string, size: MediaVariantSize, fit: MediaFit = "contain"): string | null {
  return resizedImageUrl(url, size, fit, VARIANT_QUALITY, "auto");
}

export type VideoFrameOptions = {
  fit?: MediaFit;
  natural?: MediaSize | null;
};

export function videoFrameUrl(url: string, size: MediaVariantSize | null, options: VideoFrameOptions = {}): string | null {
  return adapterFor(url)?.frame(url, { edge: size, fit: options.fit ?? "contain", natural: options.natural, format: "jpg" }) ?? null;
}

export function variantSource(url: string): MediaSource | null {
  return adapterFor(url)?.source(url) ?? null;
}

export const MODEL_IMAGE = { maxEdge: 1280, quality: 75 } as const;

export function modelImageUrl(url: string): string {
  return resizedImageUrl(url, MODEL_IMAGE.maxEdge, "contain", MODEL_IMAGE.quality, "webp") ?? url;
}

export type MediaInfo = {
  width?: number;
  height?: number;
  durationMs?: number;
  frameCount?: number;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  mimeType?: string;
  bytes?: number;
};

function positive(value: unknown): number | undefined {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number > 0
    ? number
    : undefined;
}

function sameOriginUrl(value: string | null, origin: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === origin ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function compact(info: MediaInfo): MediaInfo {
  return Object.fromEntries(
    Object.entries(info).filter(([, value]) => value !== undefined),
  ) as MediaInfo;
}

/** Media facts from response headers; `x-oss-meta-*` need CORS exposure in browsers. */
export function mediaInfoFromHeaders(headers: Headers, url: string): MediaInfo {
  const origin = new URL(url).origin;
  const meta = (name: string) => headers.get(`x-oss-meta-${name}`);
  const seconds = positive(meta("duration"));
  const frameCount = positive(meta("nb-frames"));
  return compact({
    width: positive(meta("width")),
    height: positive(meta("height")),
    durationMs: seconds ? Math.round(seconds * 1000) : undefined,
    frameCount: frameCount ? Math.round(frameCount) : undefined,
    firstFrameUrl: sameOriginUrl(meta("first-frame"), origin),
    lastFrameUrl: sameOriginUrl(meta("last-frame"), origin),
    mimeType: headers.get("content-type")?.split(";")[0]?.trim() || undefined,
    bytes: positive(headers.get("content-length")),
  });
}

export function mergeMediaInfo(primary: MediaInfo, fallback: MediaInfo): MediaInfo {
  return compact({ ...fallback, ...compact(primary) });
}

function hasDimensions(info: MediaInfo) {
  return info.width !== undefined && info.height !== undefined;
}

type ProbeOptions = {
  type: "image" | "video" | "audio";
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

async function probeHeaders(url: string, options: ProbeOptions) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const response = await fetcher(url, { method: "HEAD", signal: options.signal });
  return response.ok ? mediaInfoFromHeaders(response.headers, url) : {};
}

async function probeImageInfo(url: string, options: ProbeOptions): Promise<MediaInfo> {
  const adapter = adapterFor(url);
  const infoUrl = adapter?.imageInfoUrl(url);
  if (!adapter || !infoUrl) return {};
  const fetcher = options.fetch ?? globalThis.fetch;
  const response = await fetcher(infoUrl, { signal: options.signal });
  return response.ok ? compact(adapter.readImageInfo(await response.json())) : {};
}

export async function probeMediaInfo(
  url: string,
  options: ProbeOptions,
): Promise<MediaInfo> {
  const host = mediaHost(url);
  if (!host) return {};
  let info: MediaInfo = {};
  const attempt = async (strategy: () => Promise<MediaInfo>) => {
    try {
      info = mergeMediaInfo(info, await strategy());
    } catch {
      // Best effort: keep what earlier strategies found.
    }
  };
  if (host.metaHeaders) await attempt(() => probeHeaders(url, options));
  if (options.type === "image" && !hasDimensions(info)) {
    await attempt(() => probeImageInfo(url, options));
  }
  return info;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * A video's dimensions, read from the header of its first frame rendered as a
 * full-size PNG; only the first 24 bytes are read. Throws on failure.
 */
export async function probeVideoFrameSize(
  url: string,
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<Pick<MediaInfo, "width" | "height">> {
  const frame = adapterFor(url)?.frame(url, { edge: null, fit: "contain", format: "png" });
  if (!frame) return {};
  const fetcher = options.fetch ?? globalThis.fetch;
  const response = await fetcher(frame, {
    headers: { Range: "bytes=0-23" },
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const header = new Uint8Array(24);
  let length = 0;
  const reader = response.body?.getReader();
  while (reader && length < header.length) {
    const { done, value } = await reader.read();
    if (done) break;
    header.set(value.subarray(0, header.length - length), length);
    length += Math.min(value.length, header.length - length);
  }
  await reader?.cancel().catch(() => undefined);
  if (length < header.length || PNG_SIGNATURE.some((byte, index) => header[index] !== byte)) return {};
  const view = new DataView(header.buffer);
  return compact({ width: positive(view.getUint32(16)), height: positive(view.getUint32(20)) });
}

export async function probeMediaSize(
  url: string,
  type: "image" | "video",
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<MediaSize | null> {
  const info = await probeMediaInfo(url, { ...options, type });
  const { width, height } = info.width || type !== "video" ? info : await probeVideoFrameSize(url, options).catch(() => info);
  return width && height ? { width, height } : null;
}
