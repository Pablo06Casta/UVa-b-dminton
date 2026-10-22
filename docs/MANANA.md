# Puesta en marcha (guía de una página)

## 1. Servidor (≈ 15 min)

Necesita un proceso siempre encendido y disco persistente (Fly.io o un VPS pequeño). Elige una opción:

**A. VPS con Docker** (lo más sencillo)
```bash
git clone https://github.com/badmiton-uva/UVa-b-dminton.git && cd UVa-b-dminton/server
git checkout claude/peaceful-ride-r3scdt
npm install && npm run setup -- --site=https://badmiton-uva.github.io/UVa-b-dminton   # crea .env con token y claves
docker compose up -d            # o, sin Docker: npm start
```
Pon delante un HTTPS (Caddy, Nginx o el del proveedor): los avisos push y la web publicada en HTTPS lo exigen.

**B. Fly.io**: `fly launch --no-deploy --copy-config` · `fly volumes create club_data --size 1 --region mad` ·
`fly secrets set ADMIN_TOKEN=… VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=… SITE_URL=… CORS_ORIGINS=…` · `fly deploy`
(claves con `npm run setup` en local; o el workflow «Desplegar servidor» de GitHub con el secreto `FLY_API_TOKEN`).

Comprueba: `https://TU-SERVIDOR/api/health` devuelve `{"ok":true,…}`.

## 2. Jugadores y consentimientos (≈ 2 min)

`https://TU-SERVIDOR/admin` → entra con el token (`grep ADMIN_TOKEN .env`) → **Importar lista de jugadores (CSV)** → pega el CSV con
las columnas `nombre;categoria;perfil;menor;consentimiento;fecha;familia;publico`. Quedan visibles quienes lleven `publico = sí`
y consentimiento registrado. Revisa la tabla y, si hace falta, usa «Registrar consentimiento» / «Mostrar» / «Ocultar».

## 3. Conectar la web (≈ 2 min)

GitHub → repositorio → Settings → Secrets and variables → Actions → **Variables** → `VITE_API_URL` = `https://TU-SERVIDOR`
(sin barra final) → Actions → «Publicar en GitHub Pages» → Run workflow. En unos minutos la web usa el servidor.
(Si el servidor está en otro dominio que no sea el de la web, `CORS_ORIGINS` debe incluir el de la web.)

## 4. Día de torneo (lo que hace el club)

En `/admin` → **Directo: torneos, partidos y resultados**:
1. **Nuevo torneo** (nombre, fecha, ciudad, sede, jugadores de la UVa que juegan).
2. **Añadir partido** para cada partido de la UVa: jugadores, rival (no se publica), prueba, ronda, fecha, hora, pista.
3. Durante la jornada: **En juego** al empezar; **Finalizar…** y los sets (p. ej. `21-15 18-21 21-17`) al terminar.
4. **Cifras de la jornada** cada rato (partidos del día, terminados, en juego, pistas, duración media y retraso medio): de ahí sale
   la **hora estimada de fin del torneo** que se ve en grande en la web.

Los avisos (N minutos antes del partido) y los enlaces para compartir se generan solos con esos datos. La web se actualiza cada
5 minutos y al instante cuando el servidor avisa.

## Qué se actualiza solo

- El **calendario oficial** de torneos absolutos (cada 6 h, desde páginas públicas permitidas).
- La web (cada 5 min), los avisos (cada minuto, con lo anotado) y la copia de seguridad diaria (`data/backups`, últimas 7).

## Qué no (todavía)

La lectura automática de partidos, cuadros y perfiles de badminton.es no está implementada: sus páginas están excluidas por el
`robots.txt`. Para activarla hace falta autorización (ver `docs/SOLICITUD-AUTORIZACION.md`) y escribir los lectores a partir de
páginas de ejemplo; el motor, la estimación a partir del orden de juego y los cuadros ya están preparados.
