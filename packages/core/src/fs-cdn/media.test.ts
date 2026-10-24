import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { readMediaFacts } from "./media.js";

const u16 = (value: number) => Buffer.from([value >> 8, value & 255]);
const u32 = (value: number) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
};
const box = (type: string, ...parts: Buffer[]) => {
  const payload = Buffer.concat(parts);
  return Buffer.concat([u32(payload.length + 8), Buffer.from(type, "latin1"), payload]);
};

it("reads displayed sizes and durations from file headers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "media-facts-"));
  try {
    const exif = Buffer.concat([Buffer.from("Exif\0\0MM\0*", "latin1"), u32(8), u16(1), u16(0x0112), u16(3), u32(1), u16(6), u16(0)]);
    const jpeg = Buffer.concat([u16(0xffd8), u16(0xffe1), u16(exif.length + 2), exif, u16(0xffc0), u16(17), Buffer.from([8]), u16(200), u16(320)]);
    const mvhd = box("mvhd", Buffer.alloc(12), u32(1000), u32(3000), Buffer.alloc(80));
    const tkhd = box("tkhd", Buffer.alloc(40), u32(0), u32(0x10000), Buffer.alloc(28), u32(640 << 16), u32(360 << 16));
    const mp4 = Buffer.concat([box("ftyp", Buffer.from("isom")), box("mdat", Buffer.alloc(64)), box("moov", mvhd, box("trak", tkhd))]);
    await writeFile(join(dir, "a.jpg"), jpeg);
    await writeFile(join(dir, "v.mp4"), mp4);
    await writeFile(join(dir, "bad.mp4"), mp4.subarray(0, 40));

    assert.deepEqual(await readMediaFacts(join(dir, "a.jpg"), "image/jpeg"), { width: 200, height: 320 });
    assert.deepEqual(await readMediaFacts(join(dir, "v.mp4"), "video/mp4"), { width: 360, height: 640, durationMs: 3000 });
    assert.equal(await readMediaFacts(join(dir, "bad.mp4"), "video/mp4"), null);
    assert.equal(await readMediaFacts(join(dir, "a.jpg"), "text/plain"), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
