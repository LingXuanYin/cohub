const ROOM_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const normalizeCode = (value: string | null | undefined) => {
  const code = value?.trim().toUpperCase().replace(/\s+/g, "-") ?? "";
  return ROOM_CODE_RE.test(code) ? code : null;
};

export const spaceCode = (seed: string) => {
  let hash = 5381;
  for (const char of seed) hash = (hash * 33 + char.charCodeAt(0)) % 2_147_483_647;
  return `FIRE-${hash.toString(36).toUpperCase().padStart(6, "0").slice(-6)}`;
};

export const randomCode = (random = Math.random) =>
  `FIRE-${Array.from({ length: 5 }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join("")}`;
