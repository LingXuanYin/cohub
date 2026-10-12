export const APP_DEVICES = ["camera", "microphone"] as const;
export type AppDevice = (typeof APP_DEVICES)[number];

export const APP_DEVICES_META_NAME = "cohub:devices";

const isAppDevice = (value: unknown): value is AppDevice =>
  typeof value === "string" && (APP_DEVICES as readonly string[]).includes(value);

export function parseAppDevices(value: unknown): AppDevice[] {
  const items = typeof value === "string"
    ? value.split(/[\s,]+/)
    : Array.isArray(value) ? value : [];
  const wanted = new Set(items.map((item) => (typeof item === "string" ? item.trim().toLowerCase() : item)).filter(isAppDevice));
  return APP_DEVICES.filter((device) => wanted.has(device));
}

export const appDevicesPermissionPolicy = (devices: readonly AppDevice[]) => devices.join("; ");

export const APP_DEVICES_REQUEST_TYPE = "cohub.app.devices.request";
export const APP_DEVICES_RESULT_TYPE = "cohub.app.devices.result";

export type AppDevicesStatus = "granted" | "denied" | "unavailable";

export type AppDevicesRequestMessage = { type: typeof APP_DEVICES_REQUEST_TYPE; requestId: string; devices: AppDevice[] };
export type AppDevicesResultMessage = { type: typeof APP_DEVICES_RESULT_TYPE; requestId: string; status: AppDevicesStatus };

export function parseAppDevicesRequest(value: unknown): AppDevicesRequestMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type !== APP_DEVICES_REQUEST_TYPE || typeof record.requestId !== "string" || !record.requestId) return null;
  const devices = parseAppDevices(record.devices);
  if (devices.length === 0) return null;
  return { type: APP_DEVICES_REQUEST_TYPE, requestId: record.requestId, devices };
}

export function parseAppDevicesResult(value: unknown): AppDevicesResultMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type !== APP_DEVICES_RESULT_TYPE || typeof record.requestId !== "string") return null;
  const status = record.status;
  if (status !== "granted" && status !== "denied" && status !== "unavailable") return null;
  return { type: APP_DEVICES_RESULT_TYPE, requestId: record.requestId, status };
}
