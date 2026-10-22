# Estado del proyecto (v0.1)

## Terminado

- Páginas **Inicio**, **Historia**, **Calendario**, **Contacto** y **Legal** (esta última como estructura pendiente).
- Inicio: portada con superposición azul oscuro, presentación, logros, equipo, próximas 3 competiciones, contacto rápido y pie.
- Calendario: vista mensual y vista de lista con los mismos datos; filtros por mes, estado y categoría
  (la categoría aparece solo si hay datos); ficha detallada de cada torneo (enlazable: `/calendario?torneo=<id>`).
- Equipo, torneos, logros e historia se editan en `src/data/` sin tocar componentes.
- Navegación responsive (menú móvil accesible), teclado, foco visible, enlace "Saltar al contenido",
  `prefers-reduced-motion`, fuentes autoalojadas.
- Formulario con validación, antispam básico, prevención de envíos duplicados y estado de
  configuración visible. Tests de la lógica (`npm test`).
- Paleta tomada del logotipo UVa facilitado (`#2F2C64`) con azules complementarios.

- Calendario oficial absoluto (136 torneos, nacionales y territoriales) con fecha de última comprobación, y filtro
  «Solo con jugadores de la UVa» activo por defecto. Script `npm run calendario:actualizar` (solo rutas permitidas).

## Entrada manual y despliegue (listo)

- Panel `/admin`: torneos, partidos, «en juego», resultados por sets y cifras de la jornada → hora estimada de fin. Probado de
  punta a punta en navegador y con 104 pruebas. Guía de puesta en marcha en `docs/MANANA.md`.
- Despliegue en un comando (`npm run setup`, `docker compose up -d`), copia de seguridad diaria, comprobado con una instalación limpia.

## Servidor en directo (`server/`)

Hecho y probado con una fuente simulada y con los lectores oficiales conectados (falta la primera ejecución en vivo, ver abajo):

- Lista de jugadores con consentimiento + panel `/admin`; descubrimiento de torneos desde el perfil oficial.
- Lectura de una vez por torneo, frecuencias por fase (orden de juego cada 3 min en jornada), confirmación de cambios con
  2 lecturas, registro de cambios, antigüedad de los datos.
- Estimación de la hora de fin del torneo y de cada partido; cuadros; avisos push N min antes; enlaces para compartir.
- Web: página **Directo** (en juego / próximos / resultados, hora de fin en grande, cuadros, avisos, compartir).

Importante:

- **Lectores de páginas de torneo: conectados** (`server/src/officialReaders.ts`). Reutilizan, con permiso de su autor, los lectores
  de «Badminton Live», verificados allí con páginas oficiales reales (42 pruebas de lectores y cliente HTTP, todas en verde).
  En este repositorio hay 121 pruebas, incluido el ciclo completo con el motor real contra un servidor simulado.
- **Para que lea los datos hace falta el enlace al perfil oficial de cada jugador** (campo «Perfil» del panel `/admin` o columna
  `perfil` del CSV): de ahí descubre sus torneos. Sin enlaces no hay descubrimiento. Hoy los 8 jugadores no tienen enlace.
- **La lectura en directo está DESACTIVADA por defecto** (`OFFICIAL_READ_ENABLED=false`): las rutas de inscritos, cuadros,
  partidos y perfiles están excluidas por el `robots.txt` de badminton.es. Activarla es decisión del club; se recomienda
  autorización de la FESBA / Federación de Castilla y León. **No se ha ejecutado contra badminton.es en vivo** más que el calendario.
- Requiere alojar el servidor (ver `server/README.md`) y definir `VITE_API_URL` en la web.

## Inscripción y admisión en torneos futuros

- El servidor lee la lista de inscritos de cada prueba (una prueba por lectura, cada 6 h / 3 h / 1 h según la cercanía) de los torneos
  futuros en los que figura alguien del club, y guarda solo el estado de las personas con consentimiento: admitido, reserva, baja o
  inscrito sin confirmar. No se guardan parejas ni rivales.
- En el Calendario (tarjeta y ficha) y en Directo se ve «Inscripción y admisión». Cuando se publican, aparecen solos los cuadros
  y el orden de juego en la misma ficha.
- Torneos de los próximos 30 días (`FOLLOW_CALENDAR_DAYS`), aunque aún no tengan cuadros: se lee la lista de jugadores (solo nombres) y se
  reconoce a la gente del club por nombre; cada coincidencia se confirma con el perfil oficial que enlaza su ficha en el torneo, así que un
  homónimo de otro club no se atribuye al club. Después se lee su estado de admisión por prueba.
- Además se incluyen los torneos que enlaza el perfil oficial de cada jugador o jugadora, hasta 90 días antes (`ENTRIES_DAYS`).

## Noticias automáticas

- Cuando un torneo con resultados del club termina (pasa su último día o no quedan partidos), el servidor crea solo una noticia en el
  carrusel de la portada: medallas por prueba con el marcador de la final, o dónde cayó cada jugador/a si no hubo medallas. Solo salen
  personas con consentimiento y no se publican rivales. Se mantiene 45 días y se actualiza sola con cada lectura de resultados.
- Una noticia escrita a mano en `src/data/news.json` con el mismo `tournamentGuid` sustituye a la automática.
- Una tarea programada (sábados y domingos por la noche) comprueba que se han generado y avisa si algo no cuadra.

## Compartir y SEO

- Botón «Compartir» en cada partido, en cada torneo y en sus resultados (WhatsApp, enviar desde el móvil, copiar enlace e imágenes para
  Instagram: cuadrada para publicación y vertical para historia). El enlace enseña en WhatsApp, Telegram o X una tarjeta deportiva con el
  «vs» y el marcador (o la hora estimada si aún no se juega); la imagen cambia sola cuando cambia el partido.
- Las tarjetas las dibuja el servidor (`/og/...png`, `/compartir/...`) con la misma tipografía de la web y solo con datos públicos:
  jugadores con consentimiento y rivales únicamente si `PUBLIC_OPPONENTS=names` (si no, sale «Rival»).
- Etiquetas Open Graph y Twitter, enlace canónico, datos estructurados, `robots.txt`, `sitemap.xml` y título/descripción por página.
  La dirección pública está en `.env.production` (`VITE_SITE_URL`): cambiarla si se compra un dominio, y actualizar `public/sitemap.xml` y `robots.txt`.

## Estimación, cuadros y rendimiento

- Estimación calibrada con 1.299 partidos reales y probada con 10 torneos terminados (ver `docs/ESTIMACION.md`).
- Directo: «En juego ahora», agenda por horas (hora estimada **EST**), fin estimado del torneo, y grupos (clasificación + partidos)
  y esquema del cuadro final por prueba, todo actualizado cada minuto si hay partidos hoy.
- Rendimiento web (móvil con conexión lenta): imágenes WebP en varios tamaños (portada de 165 KB a 28–91 KB según pantalla) con la principal
  precargada, logotipos pequeños, calendario oficial incluido en la web solo bajo demanda (el código inicial pasa de 18 a 14 KB comprimido),
  una fuente menos, conexión y primeras peticiones al servidor desde el arranque, y últimos datos guardados en el navegador (30 min) para pintar
  al instante. Medido con 4G lento y CPU 4× más lenta: la portada pasa de 3,7 s a 2,1 s hasta mostrar la imagen principal y de 550 a 417 KB.
- Rendimiento: lectura de cuadros solo donde juega el club tras la primera pasada; estado público calculado una vez (caché, ETag y 304);
  caché HTTP acotada; web dividida por páginas.

## Pendiente

| Elemento | Qué hay que aportar / hacer |
| --- | --- |
| Fotografía de grupo | Portada con la foto del equipo (hecha). Falta confirmar el consentimiento de las personas que aparecen para publicar su imagen. |
| Presentación del club | Texto del informe e imagen UVa + volante (hechos). Confirmar con la UVa el uso del logotipo y el nombre. |
| Integrantes | Sección retirada de la portada por ahora (`TeamSection` sigue en el código). Volver a mostrarla cuando haya nombres, funciones y fotos **con autorización**. |
| Logros | Incorporados desde el informe del club (`achievements.json`). Cifras no respaldadas (p. ej. «17 medallas») no se muestran. |
| Historia | Cronología y fuentes incorporadas (`history.json`). Pendiente: fotos históricas. |
| Participación de la UVa | Torneos donde juegan personas de la UVa (`uva-torneos.json`), con nº de jugadores y nombres autorizados. |
| Correo y redes | Instagram @uva_bad añadido (contacto y pie). Falta el correo oficial del club en `club.json › email` (mientras esté vacío no se muestra). |
| Formulario | Envía por correo a pablitocastaneda06@gmail.com mediante FormSubmit. **Hay que pulsar «Activate Form» en el correo de activación** (una sola vez). Para cambiar de destinatario: `VITE_CONTACT_ENDPOINT`. |
| Textos legales | Versión de prueba redactada (aviso legal, privacidad, cookies). Faltan los datos del titular en `club.json › legal` (titular, NIF, domicilio, correo, contacto de protección de datos) y una revisión por la Universidad o un asesor jurídico. |
| Servidor | Alojarlo (Fly.io/VPS con disco), `ADMIN_TOKEN`, claves VAPID, `VITE_API_URL` en la web. |
| Lectura en directo | Activada por defecto. El `robots.txt` de badminton.es excluye esas rutas; el club asume la decisión. Se recomienda la autorización de la FESBA (`docs/SOLICITUD-AUTORIZACION.md`). |

## Antes de publicar

1. **Logotipo UVa:** se usa el archivo facilitado (`public/images/logo-uva.png`, 554×554 px, sin modificar).
   Confirmar con la Universidad las condiciones de uso de la marca y, si es posible, sustituirlo por la
   versión vectorial oficial de https://imagencorporativa.uva.es/.
2. Sustituir todo el contenido provisional (imágenes, torneos de ejemplo) y completar los textos legales.
3. Activar y probar el formulario con el correo de destino real.
4. Elegir dominio y hosting (con reescritura a `index.html` para todas las rutas) — no se ha publicado nada.
5. Revisión final de accesibilidad con el contenido definitivo.

## Notas de diseño

- Referencias de estética y estructura: web del Club Bádminton Burgos (cabecera, hero con imagen oscurecida,
  bloques de estadísticas, tarjetas) y composición de noticias de portales deportivos. No se han
  copiado textos ni lemas.
- Los datos provisionales se marcan siempre con la etiqueta discontinua "Provisional" / "Pendiente".

## Detección de cambios en badminton.es

badminton.es no avisa cuando publica algo, así que el servidor lo detecta con lecturas baratas y, al verlo, adelanta lo que depende de ello (`SyncEngine.kick`, mínimo 2 min entre lecturas adelantadas de lo mismo, `KICK_MIN_GAP_MINUTES`):
- Un partido que acaba de terminar (orden de juego, cada 3 min en jornada) → se leen ya los cuadros y clasificaciones.
- La lista de jugadores de un torneo cercano cambia (huella `listHash`; se mira cada 30/15/10 min según lo cerca que esté, `WATCH_LIST_*_MINUTES`) → se vuelven a leer ya las listas de cada prueba (admisión, cabezas de serie).
- El torneo cambia de fechas o jornadas → se releen cuadros e inscripciones.
- Comprobado de extremo a extremo (`server/tests/endToEnd.test.ts`): un resultado nuevo en badminton.es llega al navegador por el flujo de avisos y el estado público en ≈ 3 min (lectura cada 3 min + segunda lectura de confirmación 45 s después; `CONFIRM_GAP_SECONDS`), y los cuadros se releen justo después. En una jornada de 8 h con un partido terminado cada 8 min el servidor hace ≈ 50 lecturas/hora (el espaciado de 2,5 s permitiría 1440).
- Arranque más rápido: el servidor abre el puerto lo primero (responde `/api/health` con `starting:true` y 503 «reintenta» al resto) mientras restaura la base desde Upstash; el contenedor arranca con `node --import tsx` (sin `npx`). En local: listo en ≈ 0,5 s. La espera de Render al despertar del plan gratuito (~30-60 s) y la del despliegue (CI + construcción) no dependen del código; el aviso de keepalive de cron-job.org evita que se duerma.
- `/api/health` devuelve por defecto una respuesta pequeña (< 1 KB): cron-job.org marcaba «Fallido (salida demasiado grande)» con la completa (4,4 KB). El diagnóstico completo, con la lista de torneos, está en `/api/health?full=1` (lo usa el agente Mantenedor).

## Trayectoria del club (Directo, al final de la página) — vista mensual desde enero de 2025
- Gráfica con los partidos ganados por los jugadores públicos de la UVa en cada torneo (barras) y el total acumulado en el tiempo (línea), con medallas (oro/plata/bronce), cifras (ganados, perdidos, torneos con medalla, oros), tooltip, tabla accesible y deslizable en móvil (`src/components/live/TrajectoryChart.tsx`).
- Datos: el servidor calcula `record` por torneo (`uvaRecord` en `server/src/results.ts`: grupos + cuadros finales, sin «pasa directo»).
- Histórico: una sola lectura de los cuadros de cada torneo ya terminado de los últimos `BACKFILL_DAYS` (400) días, un torneo cada 10 min como mucho y solo cuando no hay ningún torneo en juego, para que la gráfica arranque con la temporada y no solo desde ahora.
- Vista mensual desde enero de 2025 (`START` en `TrajectoryChart.tsx`) hasta el mes actual: barras = partidos ganados en el mes, línea = acumulado, punto de color = mes con medalla. Los meses sin datos se marcan como «Sin datos publicados».
- Fuentes: (1) torneos del servidor con cuadros leídos (`record`), (2) histórico por perfil oficial: el servidor lee una vez al día `/profile/matches.aspx` de cada persona pública (≈ 100 últimos partidos, ≈ 2 temporadas; un partido de dobles cuenta una vez; la Liga Nacional se excluye; `HISTORY_ENABLED=false` lo desactiva) y lo publica como `history`; (3) `src/data/trayectoria.json` (`entradas: [{date, name, won, lost, gold, silver, bronze}]`) para que el club aporte a mano temporadas anteriores.
- Límite real: badminton.es solo publica en los perfiles las últimas ~2 temporadas, por eso la gráfica empieza en enero de 2025; para ampliarla hacia atrás, cambiar `START` y completar `trayectoria.json` con datos del club.

## Imagen de «compartir torneo»: jornada por horas con rivales
- La tarjeta del torneo lista todos los partidos de la jornada por hora (los terminados con V/D y marcador, el que se juega como AHORA, los pendientes con hora estimada) y el rival con **nombre y primer apellido** (`server/src/shareRivals.ts`), con el consentimiento expreso del club (Pablo, 22/10/2026).
- Solo viaja en la imagen y en su página de compartir: la API pública (`/api/public/state`) sigue sin rivales (`PUBLIC_OPPONENTS=none`).
- Salvaguardas: no se nombra a rivales de pruebas de menores (Sub-xx, infantil, juvenil… en el nombre de la prueba) ni en torneos solo de menores (`SHARE_RIVAL_YOUTH=true` lo permite); `SHARE_RIVAL_NAMES=off` lo quita del todo. El texto de privacidad lo recoge.

## Imágenes para Instagram por correo (agente Publicista)
- Las tarjetas llevan el logotipo oficial de la UVa (`server/src/assets/logo-uva.png`). La tarjeta del torneo, en la víspera y sin orden de juego, lista a las personas del club con prueba, nivel y cabeza de serie.
- Dos tareas programadas envían por correo (FormSubmit) los enlaces de las imágenes (cuadrada 1080×1080 y vertical 1080×1920 para stories) y un pie de foto propuesto: **Publicista · Previa** (cada día a las 18:00, solo si mañana empieza un torneo con jugadores del club) y **Publicista · Resultados** (domingos a las 22:00, torneos del fin de semana con resultados).
