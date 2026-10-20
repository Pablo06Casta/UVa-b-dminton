// Prepara el servidor en un solo paso: genera ADMIN_TOKEN y las claves de avisos (VAPID) y escribe .env.
//   npm run setup -- --site=https://pablo06casta.github.io/UVa-b-dminton
// Los secretos se guardan solo en .env (no se suben a git) y no se muestran en pantalla.
import crypto from 'node:crypto';
import fs from 'node:fs';
import webpush from 'web-push';

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const site = (arg('site') ?? 'https://pablo06casta.github.io/UVa-b-dminton').replace(/\/$/, '');
const origin = new URL(site).origin;
if (fs.existsSync('.env') && !process.argv.includes('--force')) {
  console.error('Ya existe .env: no se sobrescribe. Usa --force para regenerarlo (se perderían las claves actuales).');
  process.exit(1);
}
const vapid = webpush.generateVAPIDKeys();
const env = `# Generado por npm run setup. NO lo subas a git ni lo compartas.
ADMIN_TOKEN=${crypto.randomBytes(24).toString('base64url')}
DATA_DIR=./data
PORT=8787
SITE_URL=${site}
CORS_ORIGINS=${origin}
CALENDAR_REFRESH_ENABLED=true
OFFICIAL_READ_ENABLED=false
VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
VAPID_SUBJECT=${site}
PUBLIC_OPPONENTS=none
PUBLIC_DRAW_NAMES=initials
`;
fs.writeFileSync('.env', env, { mode: 0o600 });
console.log('Listo: se ha creado .env con ADMIN_TOKEN y claves VAPID nuevas (permisos 600).');
console.log('Para ver el token de administración: grep ADMIN_TOKEN .env');
console.log('Arranca con: npm start   (o: docker compose up -d)');
