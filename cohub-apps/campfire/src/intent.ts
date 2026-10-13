export type Intent = {
  code: string;
  name: string;
  color: string;
  mic: boolean;
  cam: boolean;
  x: number;
  y: number;
  at: number;
};

const INTENT_KEY = "campfire.intent";
const PROFILE_KEY = "campfire.profile";
const INTENT_TTL_MS = 60_000;

const storage = (kind: "session" | "local"): Storage | null => {
  try {
    return kind === "session" ? sessionStorage : localStorage;
  } catch {
    return null;
  }
};

const write = (kind: "session" | "local", key: string, value: string | null) => {
  try {
    const store = storage(kind);
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, value);
  } catch {
  }
};

export const writeIntent = (intent: Intent | null) => write("session", INTENT_KEY, intent ? JSON.stringify(intent) : null);

export const readIntent = (now = Date.now()): Intent | null => {
  const raw = storage("session")?.getItem(INTENT_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Intent>;
    if (typeof value.code !== "string" || typeof value.name !== "string" || typeof value.at !== "number") return null;
    if (now - value.at > INTENT_TTL_MS) return null;
    return {
      code: value.code,
      name: value.name,
      color: typeof value.color === "string" ? value.color : "#f4a261",
      mic: value.mic === true,
      cam: value.cam === true,
      x: typeof value.x === "number" ? value.x : 0,
      y: typeof value.y === "number" ? value.y : 0,
      at: value.at,
    };
  } catch {
    return null;
  }
};

export const readTabValue = (key: string) => storage("session")?.getItem(`campfire.${key}`) ?? null;
export const writeTabValue = (key: string, value: string) => write("session", `campfire.${key}`, value);

export type Profile = { name: string; color: string };

export const readProfile = (): Profile | null => {
  const raw = storage("local")?.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Profile>;
    return typeof value.name === "string" && typeof value.color === "string" ? { name: value.name, color: value.color } : null;
  } catch {
    return null;
  }
};

export const writeProfile = (profile: Profile) => write("local", PROFILE_KEY, JSON.stringify(profile));
