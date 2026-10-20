// Copia las páginas oficiales de ejemplo desde el repositorio privado badmiton.live (no se suben a este repositorio).
import fs from 'node:fs';
import path from 'node:path';

const from = process.argv[2] ?? process.env.FIXTURES_FROM ?? path.resolve('../../badmiton.live/tests/fixtures');
const to = path.resolve('tests/fixtures');
const files = [
  'tournament-valladolid.html', 'standings-valladolid-a.html', 'draws-estella.html', 'draw-valladolid-ko-im.html',
  'draw-valladolid-ko-dm.html', 'matches-valladolid-20261003.html', 'profile-overview.html',
];
fs.mkdirSync(to, { recursive: true });
for (const f of files) {
  fs.copyFileSync(path.join(from, f), path.join(to, f));
  console.log('copiado', f);
}
