import {
  applyBoardPatchToDocument,
  emptyBoardDocument,
  parseBoardDocument,
  type BoardDocument,
  type BoardItem,
  type BoardPatch,
  type Rect,
} from '@neta-art/cohub/board';
import * as m from './paraglide/messages.js';

export type Kind = 'character' | 'location' | 'story' | 'idea' | 'clue';
export type Card = {
  id: string;
  kind: Kind;
  title: string;
  body: string;
  image?: string;
  sources: string[];
  sourceSnapshots?: Array<Pick<Card, 'id' | 'kind' | 'title' | 'body'>>;
  prompt?: string;
  raw?: string;
  createdAt?: string;
};
export const WALKER = 'neta-companion';
export const SCRIPT = 'scripts/walker.js';
export const ink = { light: '#292c28', dark: '#edece4' };
export const muted = { light: '#70786c', dark: '#a7ad9e' };
export const paper = { light: '#fcfbf6', dark: '#262d27' };
export const accents: Record<Kind, string> = {
  character: '#b85d3f',
  location: '#50705b',
  story: '#6879a0',
  idea: '#ae873f',
  clue: '#8c7092',
};
export const kinds: Kind[] = ['character', 'location', 'story', 'idea', 'clue'];
export function kindLabel(kind: Kind) {
  return {
    character: m.card_character,
    location: m.card_location,
    story: m.card_story,
    idea: m.card_idea,
    clue: m.card_clue,
  }[kind]();
}
export function normalize(value: unknown): BoardDocument {
  const parsed = parseBoardDocument(value);
  if (!parsed.ok) throw new Error(parsed.diagnostics.map((d) => d.message).join('; '));
  return parsed.document;
}
export function apply(document: BoardDocument, patch: BoardPatch): BoardDocument {
  const result = applyBoardPatchToDocument(document, patch);
  if (!result.ok) throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  return result.document;
}
export function cardOf(id: string, item: BoardItem | undefined): Card | null {
  const value = item?.metadata?.neta;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.title !== 'string' ||
    typeof data.body !== 'string' ||
    !kinds.includes(data.kind as Kind)
  )
    return null;
  return {
    id,
    kind: data.kind as Kind,
    title: data.title,
    body: data.body,
    image: typeof data.image === 'string' ? data.image : undefined,
    sources: Array.isArray(data.sources)
      ? data.sources.filter((id): id is string => typeof id === 'string')
      : [],
  };
}
export function cards(document: BoardDocument): Card[] {
  return Object.entries(document.items).flatMap(([id, item]) => {
    const card = cardOf(id, item);
    return card ? [card] : [];
  });
}
export function cardRoot(document: BoardDocument, id: string): string | null {
  for (let depth = 0; depth < 64; depth++) {
    const item = document.items[id];
    if (!item) return null;
    if (cardOf(id, item)) return id;
    if (!item.parent) return null;
    id = item.parent;
  }
  return null;
}
export function cardPatch(card: Card, position: { x: number; y: number }): BoardPatch {
  const width = 244;
  const top = card.image ? 176 : 28;
  const excerpt = card.body.length > 150 ? `${card.body.slice(0, 147)}…` : card.body;
  const height = top + 150;
  const { id, ...data } = card;
  const items: BoardPatch['items'] = {
    [id]: {
      type: 'frame',
      z: 10,
      position,
      size: { width, height },
      props: { decoration: 'none', clip: false },
      metadata: { neta: JSON.parse(JSON.stringify(data)) },
    },
    [`${id}-paper`]: {
      type: 'shape',
      parent: id,
      size: { width, height },
      props: { geometry: 'rounded' },
      style: {
        fill: paper,
        stroke: { light: '#dedfd3', dark: '#434c40' },
        strokeWidth: 1,
        radius: 6,
      },
    },
    [`${id}-kind`]: {
      type: 'text',
      parent: id,
      position: { x: 18, y: card.image ? 153 : 10 },
      props: { text: kindLabel(card.kind), fontSize: 10, fontWeight: 600, font: 'Geist' },
      style: { fill: accents[card.kind] },
    },
    [`${id}-title`]: {
      type: 'text',
      parent: id,
      position: { x: 18, y: top + 6 },
      props: {
        text: card.title.length > 28 ? `${card.title.slice(0, 25)}…` : card.title,
        width: 208,
        fontSize: 21,
        fontWeight: 600,
        font: 'Geist',
      },
      style: { fill: ink },
    },
    [`${id}-body`]: {
      type: 'text',
      parent: id,
      position: { x: 18, y: top + 58 },
      props: { text: excerpt, width: 208, fontSize: 13, lineHeight: 1.5, font: 'Geist' },
      style: { fill: muted },
    },
  };
  if (card.image)
    items[`${id}-image`] = {
      type: 'image',
      parent: id,
      position: { x: 8, y: 8 },
      size: { width: 228, height: 136 },
      props: { src: card.image },
      style: { radius: 3 },
    };
  for (const source of card.sources)
    items[`link-${source}-${id}`] = {
      type: 'arrow',
      props: { start: { item: source }, end: { item: id }, label: m.derived(), bend: 0.1 },
      style: { stroke: accents[card.kind], strokeWidth: 1.5 },
      z: -1,
    };
  return { items };
}
export function seed(): BoardDocument {
  let document = normalize({
    board: {
      title: m.world_title(),
      background: { kind: 'dots', color: { light: '#f0f1e9', dark: '#1c231e' } },
    },
    items: {
      [WALKER]: {
        type: 'custom',
        position: { x: 310, y: 305 },
        size: { width: 48, height: 64 },
        z: 1000,
        script: { src: SCRIPT, seed: 'neta-world', params: { label: m.walker() } },
      },
    },
  });
  const entries: Array<[string, Kind, string, string, string | undefined, number, number]> = [
    ['city', 'location', m.seed_city_title(), m.seed_city_body(), 'city', 0, 0],
    ['hero', 'character', m.seed_hero_title(), m.seed_hero_body(), 'hero', 330, 70],
    ['elena', 'character', m.seed_elena_title(), m.seed_elena_body(), 'elena', 660, -10],
    [
      'cathedral',
      'location',
      m.seed_cathedral_title(),
      m.seed_cathedral_body(),
      'cathedral',
      -30,
      415,
    ],
    ['dragon', 'character', m.seed_dragon_title(), m.seed_dragon_body(), 'dragon', 360, 480],
    ['clue', 'clue', m.seed_clue_title(), m.seed_clue_body(), undefined, 720, 440],
  ];
  for (const [id, kind, title, body, image, x, y] of entries)
    document = apply(
      document,
      cardPatch(
        { id, kind, title, body, image: image ? `art/${image}.webp` : undefined, sources: [] },
        { x, y },
      ),
    );
  const items: BoardPatch['items'] = {};
  for (const [from, to] of [
    ['city', 'cathedral'],
    ['hero', 'dragon'],
    ['elena', 'clue'],
    ['cathedral', 'elena'],
  ])
    items[`rel-${from}-${to}`] = {
      type: 'arrow',
      z: -1,
      props: { start: { item: from }, end: { item: to }, bend: 0.1, label: m.relation() },
      style: { stroke: '#87927d', strokeWidth: 1.5 },
    };
  return apply(document, { items });
}
export function findSpace(rects: Rect[], near: Rect, width = 244, height = 326) {
  for (let ring = 0; ring < 80; ring++) {
    for (const side of [1, -1]) {
      const x = near.x + (side === 1 ? near.width + 80 + ring * 80 : -width - 80 - ring * 80);
      const y = near.y + ((ring % 3) - 1) * 60;
      if (
        !rects.some(
          (r) =>
            x < r.x + r.width + 28 &&
            x + width + 28 > r.x &&
            y < r.y + r.height + 28 &&
            y + height + 28 > r.y,
        )
      )
        return { x, y };
    }
  }
  return { x: Math.max(near.x, ...rects.map((r) => r.x + r.width)) + 80, y: near.y };
}
export function sanitizeImported(value: unknown): { document: BoardDocument; paused: boolean } {
  if (!value || typeof value !== 'object' || !('items' in value))
    throw new Error('Missing Board items.');
  for (const field of ['items', 'board', 'animations'] as const) {
    if (field !== 'items' && !(field in value)) continue;
    const collection = (value as Record<string, unknown>)[field];
    if (!collection || typeof collection !== 'object' || Array.isArray(collection))
      throw new Error(`Board ${field} must be an object.`);
  }
  const document = normalize(value);
  let paused = false;
  for (const item of Object.values(document.items))
    if (item.script) {
      item.script.enabled = false;
      paused = true;
    }
  return { document, paused };
}
export const blank = emptyBoardDocument;
