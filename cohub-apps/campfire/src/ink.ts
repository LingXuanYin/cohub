export const INK_COLORS = ["#f6e7c1", "#f2a65a", "#e2603f", "#7fb7d6", "#9fd6a0", "#c9a7f0"] as const;
export const INK_WIDTHS = [2, 4, 8] as const;

export type InkOp =
  | { kind: "clear" }
  | { kind: "begin"; x: number; y: number; width: number; color: string }
  | { kind: "move"; x: number; y: number }
  | { kind: "end" };

const GRID = 4096;
const OP_CLEAR = 0;
const OP_BEGIN = 1;
const OP_MOVE = 2;
const OP_END = 3;

const quantize = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * GRID);

const indexOf = <T>(list: readonly T[], value: T) => Math.max(0, list.indexOf(value));

export const encodeInk = (ops: InkOp[]): Uint8Array => {
  const bytes = new Uint8Array(ops.length * 7);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  let last: { x: number; y: number } | null = null;
  for (const op of ops) {
    if (op.kind === "clear" || op.kind === "end") {
      bytes[offset++] = op.kind === "clear" ? OP_CLEAR : OP_END;
      last = null;
      continue;
    }
    const x = quantize(op.x);
    const y = quantize(op.y);
    if (op.kind === "begin" || !last) {
      const width = op.kind === "begin" ? op.width : INK_WIDTHS[1];
      const color = op.kind === "begin" ? op.color : INK_COLORS[0];
      bytes[offset++] = OP_BEGIN;
      bytes[offset++] = indexOf(INK_WIDTHS, width as (typeof INK_WIDTHS)[number]);
      bytes[offset++] = indexOf(INK_COLORS, color as (typeof INK_COLORS)[number]);
      view.setUint16(offset, x, true);
      view.setUint16(offset + 2, y, true);
      offset += 4;
    } else {
      bytes[offset++] = OP_MOVE;
      view.setInt16(offset, x - last.x, true);
      view.setInt16(offset + 2, y - last.y, true);
      offset += 4;
    }
    last = { x, y };
  }
  return bytes.slice(0, offset);
};

export const decodeInk = (bytes: Uint8Array): InkOp[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ops: InkOp[] = [];
  let offset = 0;
  let last: { x: number; y: number } | null = null;
  while (offset < bytes.byteLength) {
    const code = bytes[offset++];
    if (code === OP_CLEAR || code === OP_END) {
      ops.push({ kind: code === OP_CLEAR ? "clear" : "end" });
      last = null;
    } else if (code === OP_BEGIN && offset + 6 <= bytes.byteLength) {
      const width = INK_WIDTHS[bytes[offset] ?? 0] ?? INK_WIDTHS[1];
      const color = INK_COLORS[bytes[offset + 1] ?? 0] ?? INK_COLORS[0];
      last = { x: view.getUint16(offset + 2, true), y: view.getUint16(offset + 4, true) };
      offset += 6;
      ops.push({ kind: "begin", x: last.x / GRID, y: last.y / GRID, width, color });
    } else if (code === OP_MOVE && last && offset + 4 <= bytes.byteLength) {
      last = { x: last.x + view.getInt16(offset, true), y: last.y + view.getInt16(offset + 2, true) };
      offset += 4;
      ops.push({ kind: "move", x: last.x / GRID, y: last.y / GRID });
    } else {
      break;
    }
  }
  return ops;
};

export const batchInk = (ops: InkOp[], limit: number): Uint8Array[] => {
  const perBatch = Math.max(1, Math.floor(limit / 7));
  const batches: Uint8Array[] = [];
  for (let index = 0; index < ops.length; index += perBatch) batches.push(encodeInk(ops.slice(index, index + perBatch)));
  return batches;
};

export const visibleInk = (ops: InkOp[]) => {
  let start = 0;
  for (let index = ops.length - 1; index >= 0; index -= 1) {
    if (ops[index]?.kind === "clear") {
      start = index;
      break;
    }
  }
  return ops.slice(start);
};
