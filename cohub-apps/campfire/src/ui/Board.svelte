<script lang="ts">
  import type { InkOp } from "../ink";

  type Props = {
    ops: InkOp[];
    version: number;
    pen: { width: number; color: string } | null;
    onStroke: (op: InkOp) => void;
  };

  let { ops, version, pen, onStroke }: Props = $props();
  let canvas = $state<HTMLCanvasElement | null>(null);
  let drawing = false;
  let last = { x: 0, y: 0 };

  const point = (event: PointerEvent) => {
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  const down = (event: PointerEvent) => {
    if (!pen) return;
    drawing = true;
    canvas?.setPointerCapture(event.pointerId);
    last = point(event);
    onStroke({ kind: "begin", ...last, ...pen });
  };

  const move = (event: PointerEvent) => {
    if (!drawing) return;
    const coalesced = event.getCoalescedEvents?.() ?? [];
    for (const sample of coalesced.length > 0 ? coalesced : [event]) {
      const next = point(sample);
      if (Math.hypot(next.x - last.x, next.y - last.y) < 0.004) continue;
      last = next;
      onStroke({ kind: "move", ...next });
    }
  };

  const up = () => {
    if (!drawing) return;
    drawing = false;
    onStroke({ kind: "end" });
  };

  $effect(() => {
    const element = canvas;
    if (!element) return;
    const observer = new ResizeObserver(() => paint());
    observer.observe(element);
    return () => observer.disconnect();
  });

  $effect(() => {
    void version;
    paint();
  });

  function paint() {
    const element = canvas;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (element.width !== Math.round(width * ratio)) element.width = Math.round(width * ratio);
    if (element.height !== Math.round(height * ratio)) element.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const unit = width / 600;
    let open = false;
    for (const op of ops) {
      if (op.kind === "clear") {
        ctx.clearRect(0, 0, width, height);
        open = false;
      } else if (op.kind === "begin") {
        if (open) ctx.stroke();
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.width * unit;
        ctx.beginPath();
        ctx.moveTo(op.x * width, op.y * height);
        ctx.lineTo(op.x * width + 0.01, op.y * height);
        open = true;
      } else if (op.kind === "move" && open) {
        ctx.lineTo(op.x * width, op.y * height);
      } else if (op.kind === "end" && open) {
        ctx.stroke();
        open = false;
      }
    }
    if (open) ctx.stroke();
  }
</script>

<canvas
  bind:this={canvas}
  class:pen={Boolean(pen)}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  aria-label="sketch board"
></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    aspect-ratio: 3 / 2;
    border-radius: var(--radius-md);
    background:
      radial-gradient(circle at 50% 120%, oklch(30% 0.05 55 / 0.5), transparent 60%),
      oklch(15% 0.02 258);
    box-shadow: inset 0 0 0 1px oklch(40% 0.03 258 / 0.5);
    touch-action: none;
  }

  .pen {
    cursor: crosshair;
    box-shadow: inset 0 0 0 1px oklch(62% 0.1 60 / 0.6);
  }
</style>
