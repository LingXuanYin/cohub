import { type FileHandle, open } from "node:fs/promises";
import { type MediaFacts, mediaFacts } from "@cohub/protocol/core";

const MAX_STEPS = 64;

type Size = { width: number; height: number };

async function read(file: FileHandle, position: number, length: number) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

const turned = ({ width, height }: Size, turn: boolean): Size => (turn ? { width: height, height: width } : { width, height });

function exifOrientation(segment: Buffer): number {
  if (segment.toString("latin1", 0, 6) !== "Exif\0\0") return 1;
  const tiff = segment.subarray(6);
  const little = tiff.toString("latin1", 0, 2) === "II";
  const u16 = (at: number) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  try {
    const ifd = little ? tiff.readUInt32LE(4) : tiff.readUInt32BE(4);
    for (let index = 0, count = u16(ifd); index < Math.min(count, MAX_STEPS); index += 1) {
      const entry = ifd + 2 + index * 12;
      if (u16(entry) === 0x0112) return u16(entry + 8);
    }
  } catch {}
  return 1;
}

async function jpegSize(file: FileHandle): Promise<Size | null> {
  let offset = 2;
  let orientation = 1;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const head = await read(file, offset, 4);
    if (head.length < 4 || head[0] !== 0xff) return null;
    const marker = head[1] as number;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = head.readUInt16BE(2);
    if (marker === 0xe1 && orientation === 1) orientation = exifOrientation(await read(file, offset + 4, length - 2));
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const frame = await read(file, offset + 5, 4);
      return turned({ width: frame.readUInt16BE(2), height: frame.readUInt16BE(0) }, orientation >= 5);
    }
    offset += 2 + length;
  }
  return null;
}

async function imageSize(file: FileHandle): Promise<Size | null> {
  const head = await read(file, 0, 32);
  if (head.readUInt32BE(0) === 0x89504e47) return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  if (head.toString("latin1", 0, 4) === "GIF8") return { width: head.readUInt16LE(6), height: head.readUInt16LE(8) };
  if (head[0] === 0xff && head[1] === 0xd8) return jpegSize(file);
  if (head.toString("latin1", 0, 4) !== "RIFF" || head.toString("latin1", 8, 12) !== "WEBP") return null;
  const chunk = head.toString("latin1", 12, 16);
  if (chunk === "VP8 ") return { width: head.readUInt16LE(26) & 0x3fff, height: head.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8X") return { width: 1 + head.readUIntLE(24, 3), height: 1 + head.readUIntLE(27, 3) };
  if (chunk !== "VP8L") return null;
  const bits = head.readUInt32LE(21);
  return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
}

type Box = { type: string; start: number; end: number };

async function boxes(file: FileHandle, start: number, end: number): Promise<Box[]> {
  const found: Box[] = [];
  for (let offset = start; found.length < MAX_STEPS && offset + 8 <= end; ) {
    const head = await read(file, offset, 16);
    if (head.length < 8) break;
    let size = head.readUInt32BE(0);
    let header = 8;
    if (size === 1 && head.length >= 16) {
      size = Number(head.readBigUInt64BE(8));
      header = 16;
    } else if (size === 0) size = end - offset;
    if (size < header) break;
    found.push({ type: head.toString("latin1", 4, 8), start: offset + header, end: Math.min(offset + size, end) });
    offset += size;
  }
  return found;
}

async function videoFacts(file: FileHandle): Promise<Partial<MediaFacts> | null> {
  const moov = (await boxes(file, 0, (await file.stat()).size)).find((box) => box.type === "moov");
  if (!moov) return null;
  let facts: Partial<MediaFacts> = {};
  for (const box of await boxes(file, moov.start, moov.end)) {
    if (box.type === "mvhd") {
      const header = await read(file, box.start, 32);
      const modern = header[0] === 1;
      const scale = header.readUInt32BE(modern ? 20 : 12);
      const duration = modern ? Number(header.readBigUInt64BE(24)) : header.readUInt32BE(16);
      if (scale) facts.durationMs = Math.round((duration / scale) * 1000);
    } else if (box.type === "trak" && !facts.width) {
      const tkhd = (await boxes(file, box.start, box.end)).find((child) => child.type === "tkhd");
      if (!tkhd) continue;
      const header = await read(file, tkhd.start, 96);
      const matrix = header[0] === 1 ? 52 : 40;
      const size = { width: header.readUInt32BE(matrix + 36) >>> 16, height: header.readUInt32BE(matrix + 40) >>> 16 };
      // Audio tracks have no size; a quarter turn shows in the matrix as a == 0.
      if (size.width && size.height) facts = { ...facts, ...turned(size, header.readInt32BE(matrix) === 0) };
    }
  }
  return facts;
}

export async function readMediaFacts(path: string, mimeType: string | null): Promise<MediaFacts | null> {
  const kind = mimeType?.split("/")[0];
  if (kind !== "image" && kind !== "video") return null;
  let file: FileHandle | undefined;
  try {
    file = await open(path, "r");
    return mediaFacts(kind === "image" ? await imageSize(file) : await videoFacts(file));
  } catch {
    return null;
  } finally {
    await file?.close().catch(() => undefined);
  }
}
