import type { BoardDocument } from '@neta-art/cohub/board';
import { normalize } from './world';

export const DRAFT_KEY = 'neta-world:draft:v1';
type Envelope = { revision: string; document: BoardDocument; updatedAt: string };
export class DraftStore {
  private revision: string | null = null;
  private blocked = false;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>) {}
  read(): BoardDocument | null {
    const raw = this.storage.getItem(DRAFT_KEY);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Envelope;
      const document = normalize(value.document);
      if (typeof value.revision !== 'string') throw new Error('Invalid draft revision.');
      this.revision = value.revision;
      return document;
    } catch (error) {
      this.blocked = true;
      throw error;
    }
  }
  save(document: BoardDocument) {
    if (this.blocked) throw new Error('Draft recovery is required.');
    const current = this.storage.getItem(DRAFT_KEY);
    if (current && (JSON.parse(current) as Envelope).revision !== this.revision)
      throw new Error('Draft changed in another window.');
    const revision = crypto.randomUUID();
    this.storage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        revision,
        document,
        updatedAt: new Date().toISOString(),
      } satisfies Envelope),
    );
    this.revision = revision;
  }
  recordImport(name: string, content: string) {
    this.storage.setItem(
      `neta-world:import:${crypto.randomUUID()}`,
      JSON.stringify({ name, content, importedAt: new Date().toISOString() }),
    );
  }
  recordCreation(id: string, value: unknown) {
    this.storage.setItem(`neta-world:creation:${id}`, JSON.stringify(value));
  }
  backup(document: BoardDocument) {
    this.storage.setItem(
      `neta-world:backup:${new Date().toISOString()}:${crypto.randomUUID()}`,
      JSON.stringify(document),
    );
  }
}
export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
