<script lang="ts">
  import type { Meadow } from "../meadow";
  import { TAU } from "../world";

  type Props = {
    meadow: Meadow;
    interactive: boolean;
    thinking: boolean;
    onTap: () => void;
  };

  let { meadow, interactive, thinking, onTap }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let pressed = false;

  $effect(() => {
    const element = canvas;
    if (!element) return;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(element.clientWidth * ratio);
      element.height = Math.round(element.clientHeight * ratio);
      element.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  });

  const toWorld = (event: PointerEvent) => {
    const rect = canvas?.getBoundingClientRect() ?? new DOMRect();
    const scale = meadow.view.scale;
    return {
      x: (event.clientX - rect.left - rect.width / 2) / scale + meadow.camera.x,
      y: (event.clientY - rect.top - rect.height / 2) / scale + meadow.camera.y,
    };
  };

  const down = (event: PointerEvent) => {
    onTap();
    if (!interactive || event.button > 0) return;
    pressed = true;
    canvas?.setPointerCapture(event.pointerId);
    const point = toWorld(event);
    meadow.walkTo(point.x, point.y);
  };

  const move = (event: PointerEvent) => {
    if (!pressed) return;
    const point = toWorld(event);
    meadow.walkTo(point.x, point.y);
  };

  const up = () => {
    pressed = false;
  };

  const wheel = (event: WheelEvent) => {
    if (!interactive) return;
    meadow.zoom = Math.max(0.65, Math.min(1.8, meadow.zoom * (event.deltaY > 0 ? 0.94 : 1.06)));
  };

  $effect(() => {
    let frame = 0;
    const paint = (now: number) => {
      frame = requestAnimationFrame(paint);
      const element = canvas;
      const ctx = element?.getContext("2d");
      if (!element || !ctx || !meadow.visibleNow) return;
      draw(ctx, element.clientWidth, element.clientHeight, now);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  });

  function draw(ctx: CanvasRenderingContext2D, width: number, height: number, now: number) {
    const scale = meadow.measure(width, height);
    const cx = width / 2 - meadow.camera.x * scale;
    const cy = height / 2 - meadow.camera.y * scale;
    const at = (x: number, y: number): [number, number] => [cx + x * scale, cy + y * scale];
    const still = meadow.reducedMotion;
    const warmth = meadow.warmth;
    const crackle = thinking && !still ? Math.sin(now / 41) * 0.08 : 0;
    const flicker = still ? 0 : Math.sin(now / 97) * 0.05 + Math.sin(now / 37) * 0.025 + crackle;
    const breath = meadow.spiritVoice * (still ? 0.15 : 0.12 + Math.sin(now / 160) * 0.1);

    ctx.fillStyle = "oklch(19% 0.03 200)";
    ctx.fillRect(0, 0, width, height);
    for (const patch of meadow.terrain.patches) {
      const [x, y] = at(patch.x, patch.y);
      const r = patch.r * scale;
      if (x < -r || x > width + r || y < -r || y > height + r) continue;
      const shade = ctx.createRadialGradient(x, y, 0, x, y, r);
      shade.addColorStop(0, `oklch(${patch.light ? 25 : 15}% 0.035 ${patch.light ? 150 : 230} / 0.55)`);
      shade.addColorStop(1, "oklch(19% 0.03 200 / 0)");
      ctx.fillStyle = shade;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const [fx, fy] = at(0, 0);
    const reach = scale * (12 + warmth * 2) * (1 + breath * 0.5);

    const pool = ctx.createRadialGradient(fx, fy, 0, fx, fy, reach);
    pool.addColorStop(0, `oklch(46% 0.1 60 / ${0.72 + flicker})`);
    pool.addColorStop(0.3, "oklch(36% 0.075 68 / 0.5)");
    pool.addColorStop(0.65, "oklch(28% 0.045 110 / 0.2)");
    pool.addColorStop(1, "oklch(22% 0.03 200 / 0)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, width, height);

    const hearth = meadow.hearth;
    ctx.save();
    ctx.setLineDash([2, 10]);
    ctx.lineCap = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = `oklch(80% 0.1 70 / ${0.18 + Math.min(0.14, warmth * 0.03)})`;
    ctx.beginPath();
    ctx.ellipse(fx, fy, hearth * scale, hearth * scale, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();

    ctx.lineWidth = Math.max(1, scale * 0.04);
    ctx.lineCap = "round";
    for (const tuft of meadow.terrain.tufts) {
      const [x, y] = at(tuft.x, tuft.y);
      if (x < -20 || x > width + 20 || y < -30 || y > height + 10) continue;
      const lit = Math.max(0, 1 - Math.hypot(tuft.x, tuft.y) / (12 + warmth));
      const sway = still ? 0 : Math.sin(now / 1300 + tuft.x) * 0.08;
      ctx.strokeStyle = `oklch(${32 + lit * 28}% ${0.05 + lit * 0.05} ${150 - lit * 75} / ${0.45 + lit * 0.45})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x, y - tuft.h * scale * 0.6, x + (tuft.lean + sway) * scale * 0.4, y - tuft.h * scale);
      ctx.stroke();
    }

    for (const tree of meadow.terrain.trees) {
      const [x, y] = at(tree.x, tree.y);
      const r = tree.w * scale;
      if (x < -r || x > width + r || y < -r || y > height + r) continue;
      ctx.fillStyle = "oklch(9% 0.03 240 / 0.55)";
      ctx.beginPath();
      ctx.ellipse(x + r * 0.25, y + r * 0.3, r, r * 0.8, 0, 0, TAU);
      ctx.fill();
      for (let ring = 0; ring < 3; ring += 1) {
        ctx.fillStyle = `oklch(${13 + ring * 4 + tree.dark * 5}% 0.04 ${185 - ring * 15})`;
        needles(ctx, x - ring * r * 0.05, y - ring * r * 0.12, r * (1 - ring * 0.28), tree.dark * TAU);
        ctx.fill();
      }
    }

    const night = ctx.createRadialGradient(fx, fy, scale * 8, fx, fy, Math.max(width, height) * 0.9);
    night.addColorStop(0, "oklch(10% 0.03 258 / 0)");
    night.addColorStop(1, "oklch(10% 0.03 258 / 0.6)");
    ctx.fillStyle = night;
    ctx.fillRect(0, 0, width, height);

    ctx.lineCap = "round";
    for (const [angle, length] of LOGS) {
      const [x1, y1] = at(Math.cos(angle) * length, Math.sin(angle) * length);
      const [x2, y2] = at(-Math.cos(angle) * length, -Math.sin(angle) * length);
      ctx.strokeStyle = "oklch(30% 0.05 45)";
      ctx.lineWidth = scale * 0.34;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.strokeStyle = `oklch(66% 0.17 48 / ${0.4 + flicker * 2})`;
      ctx.lineWidth = scale * 0.08;
      ctx.stroke();
    }

    for (const stone of meadow.terrain.stones) {
      const [x, y] = at(stone.x, stone.y);
      ctx.fillStyle = "oklch(34% 0.025 55)";
      ctx.beginPath();
      ctx.ellipse(x, y, stone.r * scale, stone.r * scale * 0.72, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `oklch(56% 0.07 60 / ${0.16 + flicker})`;
      ctx.beginPath();
      ctx.ellipse(x - stone.r * scale * 0.25, y - stone.r * scale * 0.3, stone.r * scale * 0.55, stone.r * scale * 0.34, 0, 0, TAU);
      ctx.fill();
    }

    const size = meadow.fireScale * (1 + breath);
    const tall = scale * (1.15 + size * 1.5);
    const sway = still ? 0 : Math.sin(now / 280) * scale * 0.07;
    const halo = scale * (5 + size * 3.4);
    const glow = ctx.createRadialGradient(fx, fy - tall * 0.45, 0, fx, fy - tall * 0.45, halo);
    glow.addColorStop(0, `oklch(86% 0.13 72 / ${0.6 + flicker * 2})`);
    glow.addColorStop(0.35, `oklch(72% 0.17 54 / ${0.28 + Math.max(0, flicker)})`);
    glow.addColorStop(0.7, "oklch(62% 0.16 45 / 0.1)");
    glow.addColorStop(1, "oklch(58% 0.15 42 / 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(fx - halo, fy - halo, halo * 2, halo * 2);
    for (const [offset, ratio, color] of FLAMES) {
      const lick = still ? 1 : 1 + Math.sin(now / (110 + ratio * 60) + offset * 9) * 0.06;
      ctx.fillStyle = color;
      ctx.beginPath();
      flame(ctx, fx + sway * offset * 1.5 + offset * scale * 0.5 * size, fy, scale * 0.95 * ratio * size, tall * ratio * lick, sway * (1 - ratio));
      ctx.fill();
    }

    meadow.motes.draw(ctx, scale, at);

    for (const fly of meadow.terrain.fireflies) {
      const t = now / 1000;
      const x = fly.x + (still ? 0 : Math.sin(t * 0.3 * fly.drift + fly.phase) * 1.2);
      const y = fly.y + (still ? 0 : Math.cos(t * 0.23 * fly.drift + fly.phase * 2) * 0.9);
      const dark = Math.min(1, Math.max(0, (Math.hypot(x, y) - hearth - 3) / 6));
      const blink = still ? 0.7 : Math.max(0, Math.sin(t * fly.drift + fly.phase));
      const alpha = dark * blink * 0.85;
      if (alpha < 0.05) continue;
      const [px, py] = at(x, y);
      if (px < -10 || px > width + 10 || py < -10 || py > height + 10) continue;
      const halo = ctx.createRadialGradient(px, py, 0, px, py, scale * 0.35);
      halo.addColorStop(0, `oklch(92% 0.14 112 / ${alpha})`);
      halo.addColorStop(1, "oklch(85% 0.14 112 / 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(px - scale * 0.35, py - scale * 0.35, scale * 0.7, scale * 0.7);
    }
  }

  function needles(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, turn: number) {
    const points = 11;
    ctx.beginPath();
    for (let index = 0; index <= points * 2; index += 1) {
      const angle = turn + (index / (points * 2)) * TAU;
      const reach = index % 2 === 0 ? r : r * 0.72;
      if (index === 0) ctx.moveTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
      else ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
    }
    ctx.closePath();
  }

  function flame(ctx: CanvasRenderingContext2D, x: number, y: number, half: number, tall: number, lean: number) {
    ctx.moveTo(x - half, y);
    ctx.bezierCurveTo(x - half, y - tall * 0.45, x - half * 0.2 + lean, y - tall * 0.7, x + lean * 1.4, y - tall);
    ctx.bezierCurveTo(x + half * 0.2 + lean, y - tall * 0.7, x + half, y - tall * 0.45, x + half, y);
    ctx.quadraticCurveTo(x, y + half * 0.5, x - half, y);
  }

  const LOGS: Array<[number, number]> = [
    [0.35, 1.7],
    [-0.55, 1.6],
    [1.25, 1.45],
    [2.4, 1.5],
  ];

  const FLAMES: Array<[number, number, string]> = [
    [-1.3, 0.62, "oklch(56% 0.19 34 / 0.88)"],
    [1.35, 0.58, "oklch(58% 0.19 36 / 0.88)"],
    [-0.6, 0.86, "oklch(62% 0.2 42 / 0.9)"],
    [0.65, 0.8, "oklch(66% 0.19 46 / 0.92)"],
    [0, 1, "oklch(72% 0.18 52 / 0.93)"],
    [-0.3, 0.44, "oklch(84% 0.14 70 / 0.95)"],
    [0.3, 0.4, "oklch(88% 0.12 78 / 0.95)"],
    [0, 0.3, "oklch(95% 0.08 92 / 0.96)"],
  ];
</script>

<canvas
  bind:this={canvas}
  class:interactive
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onwheel={wheel}
  oncontextmenu={(event) => event.preventDefault()}
  aria-hidden="true"
></canvas>

<style>
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }

  .interactive {
    cursor: pointer;
  }
</style>
