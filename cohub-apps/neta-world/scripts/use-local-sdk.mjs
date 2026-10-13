import { cp, access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/use-local-sdk.mjs <built-sdk-package-directory>');
const root = resolve(source);
const target = fileURLToPath(new URL('../node_modules/@neta-art/cohub/', import.meta.url));
const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (metadata.name !== '@neta-art/cohub') throw new Error('Expected the Cohub SDK package.');
await access(resolve(root, 'dist/board/model/overlay-placement.js'));
await access(resolve(target, 'package.json'));
await cp(resolve(root, 'dist'), resolve(target, 'dist'), { recursive: true });
console.log(
  `Using locally built Cohub SDK ${metadata.version}. Run npm ci to restore the registry package.`,
);
