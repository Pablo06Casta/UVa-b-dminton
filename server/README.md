# Servidor del club (lista de jugadores, directo, avisos y calendario)

Servidor Node.js 22 independiente de la web. **Solo lectura para el público**, con panel de administración protegido.

```
badminton.es ──(≥2,5 s entre peticiones, caché, reintentos, corte)──▶ motor de sincronización ──▶ SQLite
                                                                                                 │
navegador ◀── /api/public/state (cada 5 min + aviso SSE) ──────────────────────────────────────┘
navegador ◀── avisos Web Push (N min antes del partido de un jugador) · /compartir/:partido
```

El navegador **nunca** consulta badminton.es: solo habla con este servidor.

## Qué hace

| Función | Cómo |
|---|---|
| Lista cerrada de jugadores | Panel `/admin`: nombre, perfil oficial, categoría, menor, consentimiento y «mostrar públicamente». |
| Descubrimiento de torneos | Desde el perfil oficial de cada jugador de la lista (o añadiendo un torneo a mano en `/admin`). Nada de rastrear todos los torneos. |
| Lectura | **Una vez por torneo** (no por jugador): información, cuadros/clasificaciones (de ahí sale el club de cada participante) y orden de juego del día. |
| Frecuencias | Antes del torneo cada 4 h · el día antes, cuadros cada 20 min · en jornada, orden de juego cada **5 min** y cuadros cada 20 min · terminado, una pasada y silencio. Todo ajustable (`.env.example`). |
| Cambios | Un cambio de hora, pista o resultado se confirma con **2 lecturas idénticas** seguidas. Cada cambio se registra (sin nombres). |
| Estimación | Duración media de los partidos terminados, retraso real frente a lo programado, partidos que quedan y pistas → **hora estimada de fin del torneo** (con margen P10–P90) y hora estimada de cada partido del club. |
| Avisos | Web Push opcional, N minutos antes (20 por defecto) del partido de un jugador público concreto. Una sola vez por partido. |
| Compartir | `/compartir/:partido` muestra una vista previa (Open Graph) y lleva a la web del club. |
| Calendario | Torneos absolutos (nacionales y territoriales) desde el calendario FESBA y el buscador oficial, cada 6 h. |
| Si la fuente falla | Se conservan los últimos datos y se muestra su antigüedad («Última actualización: HH:MM:SS»). Si pasan más de 30 min sin lectura correcta, se marcan como **antiguos**, nunca como «en directo». |

## Autorización (léelo antes de activar el directo)

El `robots.txt` de badminton.es excluye para clientes automáticos `/sport/`, `/tournament/`, `/profile/`, `/player/` y
`/ranking/`: justo las rutas de inscritos, cuadros, partidos y perfiles. Por eso:

- **`OFFICIAL_READ_ENABLED=false` por defecto.** Con él desactivado el servidor solo actualiza el calendario (rutas
  permitidas), gestiona la lista de jugadores y sirve la API.
- Activar el directo es una decisión del club. **Se recomienda pedir autorización por escrito a la FESBA y a la Federación
  de Castilla y León** (o acceso oficial a los datos). Cuando la tengáis, ponedlo a `true`.
- El cliente HTTP nunca baja de 2,5 s entre peticiones, usa caché, reintentos con espera creciente y se detiene ante 429/5xx.

## Protección de datos (RGPD)

- Nadie se publica sin interruptor «mostrar públicamente», que **exige registrar quién consintió y cuándo**; en menores,
  además el consentimiento de su familia (lo hace cumplir la base de datos, no solo la pantalla).
- Un partido con alguien del club sin consentimiento **no se publica entero**. Una persona del club que no está en la lista nunca se publica.
- Rivales: **no se publican** (`PUBLIC_OPPONENTS=none`). Cuadros: solo los que tienen jugadores públicos; el resto, con
  iniciales (`PUBLIC_DRAW_NAMES`).
- Los avisos push solo existen para jugadores públicos; al ocultar o borrar a alguien se eliminan.
- Borrar a una persona en `/admin` elimina sus participaciones y partidos. El registro de cambios no contiene nombres.
- Las personas con el club de la UVA que aparecen en clasificaciones pero no están en la lista salen **solo en `/admin`**
  («candidatos») para pedirles consentimiento.
- Revisión pendiente: el responsable del tratamiento y el texto de privacidad deben validarse con el DPD de la UVA.

## Puesta en marcha

```bash
cd server
npm install
cp .env.example .env        # (el servidor lee variables de entorno; en tu alojamiento, defínelas allí)
npm run vapid               # claves para los avisos → a las variables de entorno, no al chat
npm start                   # http://localhost:8787
npm run demo                # servidor de demostración con datos ficticios (no consulta badminton.es)
npm test                    # 73 pruebas
```

1. Define `ADMIN_TOKEN` y entra en `/admin`. Añade a los jugadores (con su consentimiento) y, si los tienes, sus perfiles oficiales.
2. En la web (GitHub → Settings → Secrets and variables → Actions → **Variables**) crea `VITE_API_URL` con la dirección del servidor y vuelve a publicar.
3. Cuando haya autorización: `OFFICIAL_READ_ENABLED=true`.

## Alojamiento

- Necesita **un proceso siempre encendido y un disco persistente** (la base de datos guarda la lista de jugadores y los consentimientos).
  `fly.toml` y `Dockerfile` son plantillas para Fly.io (volumen + `min_machines_running = 1`). Cualquier VPS pequeño sirve.
- Los alojamientos gratuitos que se duermen o borran el disco **no valen** para el directo ni para los avisos. Si hubiera que usarlos:
  monitor externo sobre `/api/health` cada 10 min y copia de la lista (`GET /api/admin/export`, `POST /api/admin/import`).
- Copias de seguridad: `/data/club.sqlite` (o `GET /api/admin/export` para la lista).

## API

Pública: `GET /api/public/state` · `GET /api/public/stream` (SSE) · `GET /api/public/calendar` · `GET /api/public/push/key` ·
`POST /api/public/push/subscribe|unsubscribe` · `GET /compartir/:partido` · `GET /api/health`.
Administración (`Authorization: Bearer ADMIN_TOKEN`): `/api/admin/players`, `/tournaments`, `/candidates`, `/status`, `/export`, `/import`.

## Código reutilizado

Copiado y adaptado de `Pablo06Casta/badmiton.live`: `src/lib/ts/http.ts` (cliente prudente), `src/lib/ts/parse/*` (lectores de
páginas oficiales), `src/lib/ts/source.ts`, `src/lib/util/*`, y la lógica de calendario FESBA/buscador (`src/lib/org/parse.ts`).
El motor (`src/engine.ts`) es nuevo: pasa de «seguir a una persona» a «leer una vez por torneo».

## Pruebas con páginas oficiales reales

`npm run fixtures:copy` copia desde `badmiton.live/tests/fixtures` unas páginas reales (torneo de Valladolid, 3-oct-2026) a
`tests/fixtures/` (ignorado por git: contienen nombres de personas). Con ellas, `npm test` ejecuta el recorrido completo con
129 partidos reales. Sin ellas, esas 4 pruebas se omiten.
