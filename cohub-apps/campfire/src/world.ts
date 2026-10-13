import { EMBER_HALF_LIFE_MS, FIRE_CLEARANCE, MEADOW_RADIUS } from "./protocol";

export const TAU = Math.PI * 2;

export const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);

export const confine = (x: number, y: number) => {
  const distance = Math.hypot(x, y);
  if (distance > MEADOW_RADIUS) {
    const scale = MEADOW_RADIUS / distance;
    x *= scale;
    y *= scale;
  }
  if (distance < FIRE_CLEARANCE) {
    const angle = distance < 1e-3 ? Math.random() * TAU : Math.atan2(y, x);
    x = Math.cos(angle) * FIRE_CLEARANCE;
    y = Math.sin(angle) * FIRE_CLEARANCE;
  }
  return { x, y };
};

let seed = 20_260_413;
const rand = () => {
  seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const resetRand = (value = 20_260_413) => {
  seed = value;
};

export type Firefly = { x: number; y: number; phase: number; drift: number };
export type Tuft = { x: number; y: number; h: number; lean: number };
export type Tree = { x: number; y: number; w: number; dark: number };
export type Ember = { x: number; y: number; vx: number; vy: number; life: number; size: number };

export type Patch = { x: number; y: number; r: number; light: boolean };

export type Terrain = {
  fireflies: Firefly[];
  patches: Patch[];
  tufts: Tuft[];
  trees: Tree[];
  stones: Array<{ x: number; y: number; r: number }>;
};

export const buildTerrain = (): Terrain => {
  resetRand();
  const fireflies: Firefly[] = Array.from({ length: 70 }, () => {
    const angle = rand() * TAU;
    const radius = 7 + rand() * (MEADOW_RADIUS - 6);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, phase: rand() * TAU, drift: 0.6 + rand() * 1.4 };
  });
  const patches: Patch[] = Array.from({ length: 60 }, () => {
    const angle = rand() * TAU;
    const radius = Math.sqrt(rand()) * (MEADOW_RADIUS + 4);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, r: 2.5 + rand() * 4, light: rand() > 0.5 };
  });
  const tufts: Tuft[] = Array.from({ length: 1100 }, () => {
    const angle = rand() * TAU;
    const radius = FIRE_CLEARANCE + 0.4 + Math.sqrt(rand()) * (MEADOW_RADIUS - 2);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      h: 0.18 + rand() * 0.42,
      lean: rand() * 0.6 - 0.3,
    };
  });
  const trees: Tree[] = [
    ...Array.from({ length: 120 }, (_, index) => {
      const angle = (index / 60) * TAU + rand() * 0.1;
      const radius = MEADOW_RADIUS + 1.5 + (index % 2) * 3 + rand() * 3;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, w: 1.6 + rand() * 1.4, dark: rand() };
    }),
    ...Array.from({ length: 9 }, () => {
      const angle = rand() * TAU;
      const radius = 13 + rand() * 9;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, w: 1.1 + rand() * 0.8, dark: rand() };
    }),
  ];
  const stones = Array.from({ length: 9 }, (_, index) => {
    const angle = (index / 9) * TAU + rand() * 0.2;
    const radius = 1.1 + rand() * 0.25;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, r: 0.22 + rand() * 0.14 };
  });
  return { fireflies, patches, tufts, trees, stones };
};

export const fireWarmth = (emberTimes: number[], now: number) => {
  let warmth = 0;
  for (const at of emberTimes) {
    const age = Math.max(0, now - at);
    warmth += 0.5 ** (age / EMBER_HALF_LIFE_MS);
  }
  return warmth;
};

export const fireScale = (warmth: number) => 0.62 + 0.38 * (1 - Math.exp(-warmth / 2.4));
export const hearthRadius = (warmth: number) => 3.4 + Math.min(4, warmth * 0.55);

export class Motes {
  private readonly items: Ember[] = [];

  spawn(count: number, warmth: number) {
    const room = Math.min(count, 60 - this.items.length);
    for (let index = 0; index < room; index += 1) {
      const angle = rand() * TAU;
      const radius = rand() * (0.5 + warmth * 0.08);
      this.items.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.5 - 0.6,
        vx: (rand() - 0.5) * 0.4,
        vy: -0.9 - rand() * (0.8 + warmth * 0.2),
        life: 1,
        size: 0.03 + rand() * 0.05,
      });
    }
  }

  step(dt: number) {
    for (const item of this.items) {
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.vx += Math.sin(item.y * 2.3) * 0.35 * dt;
      item.life -= dt * (0.45 + item.size * 3);
    }
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      if ((this.items[index]?.life ?? 0) <= 0) this.items.splice(index, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D, scale: number, at: (x: number, y: number) => [number, number]) {
    for (const item of this.items) {
      const [x, y] = at(item.x, item.y);
      ctx.fillStyle = `oklch(${78 + item.life * 14}% ${0.1 + item.life * 0.06} ${50 + item.life * 30} / ${Math.max(0, item.life) * 0.9})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.8, item.size * scale), 0, TAU);
      ctx.fill();
    }
  }
}
