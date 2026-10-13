import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const QUOTA = { total: 4, perViewer: 1, freshMs: 90_000 } as const;

export type QuotaRefusal = "SPIRIT_BUSY" | "SPIRIT_ALREADY_AWAKE";

export class Quota {
  private readonly file: string;
  private readonly viewer: string;

  constructor(run: string, viewer: string, private readonly dir = join(tmpdir(), "campfire-spirits")) {
    this.file = join(dir, `${run}.json`);
    this.viewer = viewer;
  }

  claim(now = Date.now()): QuotaRefusal | null {
    mkdirSync(this.dir, { recursive: true });
    const awake = this.awake(now);
    if (this.viewer && awake.filter((viewer) => viewer === this.viewer).length >= QUOTA.perViewer) return "SPIRIT_ALREADY_AWAKE";
    if (awake.length >= QUOTA.total) return "SPIRIT_BUSY";
    this.beat();
    return null;
  }

  beat() {
    writeFileSync(this.file, JSON.stringify({ viewer: this.viewer }));
  }

  release() {
    rmSync(this.file, { force: true });
  }

  private awake(now: number) {
    const viewers: string[] = [];
    for (const name of readdirSync(this.dir)) {
      const path = join(this.dir, name);
      try {
        if (now - statSync(path).mtimeMs > QUOTA.freshMs) {
          rmSync(path, { force: true });
          continue;
        }
        viewers.push(String((JSON.parse(readFileSync(path, "utf8")) as { viewer?: unknown }).viewer ?? ""));
      } catch {
      }
    }
    return viewers;
  }
}
