// Holt den LV-Kern (Parser + Fingerabdruck) aus einem bubbleLV-Checkout nach src/core.
// Aufruf: node scripts/sync-core.mjs [Pfad zu bubbleLV] [Git-Stand, Standard origin/main]
// Der Kern wird kopiert statt verlinkt: npm kann kein Unterverzeichnis eines Git-Repos
// installieren, und der BIM-Viewer soll ohne Zugriff auf bubbleLV bauen.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const source = resolve(process.argv[2] ?? '../bubbleLV');
const ref = process.argv[3] ?? 'origin/main';
const target = resolve('src/core');
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' });

const commit = git('rev-parse', ref).trim();
const temp = mkdtempSync(join(tmpdir(), 'conocto-core-'));
execFileSync('sh', ['-c', `git -C "${source}" archive ${commit} packages/core/src | tar -x -C "${temp}"`]);
rmSync(target, { recursive: true, force: true });
cpSync(join(temp, 'packages/core/src'), target, { recursive: true });
rmSync(temp, { recursive: true, force: true });
writeFileSync(
  join(target, 'QUELLE.md'),
  `# LV-Kern aus bubbleLV

Kopie von \`packages/core/src\` aus NicPalapte/bubbleLV, Stand \`${commit}\`.
Nicht hier ändern: Änderungen gehören nach bubbleLV, dann \`node scripts/sync-core.mjs\`.
\`tests/core.test.ts\` prüft, dass die Fingerabdrücke denen in Conocto Doc gleichen.
`,
);
console.log(`src/core ← bubbleLV ${commit.slice(0, 7)}`);
