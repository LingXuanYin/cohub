import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { BoardSettingsSchema } from "@cohub/protocol";

const migrations = join(dirname(fileURLToPath(import.meta.url)), "../../../../apps/api/drizzle/v2");
const read = (tag: string) => readFileSync(join(migrations, `${tag}.sql`), "utf8").replaceAll("--> statement-breakpoint", "");
const BOARD_ID = "11111111-1111-4111-8111-111111111111";

const cases: Array<[unknown, unknown]> = [
	[{ background: { kind: "dots" } }, { background: {} }],
	[
		{ title: "T", background: { kind: "grid", color: "#101010" }, grid: { visible: true, size: 32 }, enter: { preset: "deal" } },
		{ title: "T", background: { color: "#101010", pattern: "grid" }, grid: { size: 32, snap: true }, enter: { preset: "deal" } },
	],
	[
		{ background: { kind: "image", imageUrl: "https://cdn.example.com/a.png", opacity: 0.5 }, grid: { visible: false, size: 24 } },
		{ background: { image: { src: "https://cdn.example.com/a.png", fit: "cover", opacity: 0.5 } }, grid: { size: 24, snap: false } },
	],
	[{ background: { kind: "solid", imageUrl: "https://cdn.example.com/stale.png", fit: "repeat" } }, { background: {} }],
	...["http://localhost:3000/a.png", "http://cdn.local./a.png", "http://10.0.0.1/a.png", "http://172.20.1.1/a.png", "https://user@cdn.example.com/a.png", "http://[2001:4860::1]/a.png", "http://0x7f000001/a.png", "http://0177.0.0.1/a.png"].map(
		(imageUrl): [unknown, unknown] => [{ background: { kind: "image", imageUrl } }, { background: {} }],
	),
	...["http://8.8.8.8/a.png", "https://例子.测试/a.png", "https://CDN.Example.com:8443/a.png?x=1"].map(
		(imageUrl): [unknown, unknown] => [{ background: { kind: "image", imageUrl } }, { background: { image: { src: imageUrl, fit: "cover" } } }],
	),
	[{ background: { pattern: "dots" }, grid: { size: 24, snap: true } }, { background: { pattern: "dots" }, grid: { size: 24, snap: true } }],
	[{}, {}],
];

test("board settings, history and Save snapshots migrate to background layers", async () => {
	const client = new PGlite({ extensions: { pg_trgm } });
	const { entries } = JSON.parse(readFileSync(join(migrations, "meta/_journal.json"), "utf8")) as { entries: Array<{ tag: string }> };
	const tags = entries.map((entry) => entry.tag);
	const target = tags.indexOf("0076_board_background_layers");
	for (const tag of tags.slice(0, target)) await client.exec(read(tag));

	for (const [index, [settings]] of cases.entries()) {
		const id = `${BOARD_ID.slice(0, -2)}${String(index).padStart(2, "0")}`;
		await client.query(`INSERT INTO "v2"."boards" ("id", "space_id", "title", "settings") VALUES ($1, $1, 'B', $2)`, [id, settings]);
		await client.query(
			`INSERT INTO "v2"."board_transactions" ("board_id", "tx_id", "base_version", "result_version", "actor_id", "patch", "changes", "receipt") VALUES ($1, 'tx', 0, 1, 'u', $2, $3, '{"changed":{"board":true}}')`,
			[id, { board: settings }, { before: { board: settings, items: {} }, after: { board: settings } }],
		);
		await client.query(
			`INSERT INTO "v2"."board_checkpoints" ("checkpoint_id", "source_board_id", "source_space_id", "source_version", "snapshot") VALUES ($1, $1, $1, 1, $2)`,
			[id, { kind: "cohub.board.snapshot", version: 3, board: settings, items: {}, animations: {} }],
		);
	}
	const migration = read(tags[target] as string);
	await client.exec(migration);
	const snapshot = async () => (await client.query<{ settings: unknown; patch: { board: unknown }; changes: { before: { board: unknown; items: unknown }; after: { board: unknown } }; checkpoint: { version: number; board: unknown } }>(`
		SELECT b."settings", t."patch", t."changes", c."snapshot" AS checkpoint FROM "v2"."boards" b
		JOIN "v2"."board_transactions" t ON t."board_id" = b."id"
		JOIN "v2"."board_checkpoints" c ON c."source_board_id" = b."id"
		ORDER BY b."id"`)).rows;
	const rows = await snapshot();

	for (const [index, [settings, expected]] of cases.entries()) {
		const row = rows[index];
		assert.deepEqual(row?.settings, expected, JSON.stringify(settings));
		assert.deepEqual(BoardSettingsSchema.parse(row?.settings), BoardSettingsSchema.parse(expected));
		assert.deepEqual(row?.changes, { before: { board: expected, items: {} }, after: { board: expected } });
		assert.deepEqual(row?.checkpoint.board, expected);
		assert.equal(row?.checkpoint.version, 4);
		assert.deepEqual(row?.patch, { board: settings });
	}
	await client.exec(migration);
	assert.deepEqual(await snapshot(), rows);
	await client.close();
});
