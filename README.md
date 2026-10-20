# Web del Club Bádminton Universidad de Valladolid

Primera versión de la web del club: **Inicio**, **Historia**, **Calendario** y **Contacto**
(más una página de información legal enlazada desde el pie).

## Tecnología

**Vite + React + TypeScript + React Router.** Es una arquitectura sencilla y mantenible: todo el
contenido vive en ficheros de datos (`src/data/*.json`), separado de los componentes, y el resultado
es una web estática que se puede alojar en cualquier hosting. Las fuentes (Libre Franklin) se
sirven desde la propia web, sin depender de servicios externos.

## Ejecutar

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm run build      # genera la web estática en dist/ (incluye comprobación de tipos)
npm run preview    # sirve dist/ en local
npm test           # tests de la lógica de fechas, torneos y validación
```

Al publicar, el hosting debe devolver `index.html` para cualquier ruta (`/historia`, `/calendario`…).
En Netlify, Cloudflare Pages o Vercel esto es una opción de "SPA fallback"; en Apache/Nginx, una regla
de reescritura.

## Cómo actualizar el contenido

| Qué | Dónde |
| --- | --- |
| Textos del club, correo, redes, dirección, imágenes de portada | `src/data/club.json` |
| Integrantes del equipo | `src/data/players.json` |
| Calendario oficial de torneos absolutos (se regenera con un comando) | `src/data/calendario-oficial.json` |
| Participación de la UVa en torneos (la informa el club) | `src/data/uva-torneos.json` |
| Logros y estadísticas | `src/data/achievements.json` |
| Historia (secciones, línea temporal, fotos) | `src/data/history.json` |
| Fotografías | `public/images/` |
| Menú de navegación y configuración del formulario | `src/config/site.ts` |

Los tipos de cada fichero están documentados en `src/types.ts`.

**Añadir un integrante** (`players.json`; mientras la lista esté vacía se muestran tarjetas de marcador):

```json
{ "id": "nombre-apellido", "name": "Nombre Apellidos", "role": "Jugador", "photo": "/images/equipo/nombre.jpg", "info": "Opcional" }
```

**Calendario oficial.** `npm run calendario:actualizar` lee el calendario FESBA y el buscador de torneos de
badminton.es (solo rutas permitidas por su `robots.txt`, una petición cada 2,5 s, unas 10 en total) y regenera
`calendario-oficial.json` con los torneos absolutos nacionales y territoriales. La web muestra la fecha de la
última comprobación. Frecuencia razonable: una o dos veces al día (el calendario cambia poco).

**Torneos con jugadores de la UVa.** La web muestra por defecto solo estos. La lista de inscritos de badminton.es
no indica el club, así que la participación la registra el club en `uva-torneos.json`:

```json
{ "entradas": [ { "tournamentId": "fesba-88169", "clubParticipants": 3, "players": ["Nombre Apellidos"] } ],
  "torneosPropios": [] }
```

`tournamentId` es el `id` del torneo en `calendario-oficial.json`. Solo se listan nombres con autorización
(en menores, de su familia). `torneosPropios` admite torneos que no estén en el calendario oficial absoluto.

**Equipo.** Una persona solo se muestra si tiene `"consent": true` en `players.json`.

**Sustituir la foto de portada**: copia la imagen a `public/images/` y cambia `images.hero` en
`club.json` (`"provisional": false` oculta el aviso de imagen provisional). Lo mismo para `images.about`.

## Formulario de contacto

El formulario valida los campos, comprueba el formato del correo, evita envíos duplicados, incluye
antispam básico (campo trampa y tiempo mínimo) y exige aceptar la política de privacidad.
**No simula envíos:** mientras no haya servicio configurado muestra "Tu mensaje NO se ha enviado".

Para activarlo, copia `.env.example` a `.env` y rellena `VITE_CONTACT_ENDPOINT` con la URL de un
servicio que acepte `POST` con JSON (`nombre`, `apellidos`, `email`, `mensaje`) y recompila.
Se recomienda un servicio con captcha y validación en servidor.

## Calendario y fuente oficial

Todas las páginas leen los torneos a través de `src/lib/tournamentSource.ts`. Hoy se alimentan de
`tournaments.json`; si en el futuro se autoriza una fuente oficial, solo hay que añadir otra
implementación de `TournamentSource` ahí. **No se ha implementado ni asumido ninguna integración.**

Estado del proyecto y datos pendientes: ver [`docs/ESTADO.md`](docs/ESTADO.md).
