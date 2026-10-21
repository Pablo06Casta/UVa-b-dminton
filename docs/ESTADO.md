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
- Lectura de una vez por torneo, frecuencias por fase (orden de juego cada 5 min en jornada), confirmación de cambios con
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

## Estimación, cuadros y rendimiento

- Estimación calibrada con 1.299 partidos reales y probada con 10 torneos terminados (ver `docs/ESTIMACION.md`).
- Directo: «En juego ahora», agenda por horas (hora estimada **EST**), fin estimado del torneo, y grupos (clasificación + partidos)
  y esquema del cuadro final por prueba, todo actualizado cada minuto si hay partidos hoy.
- Rendimiento: lectura de cuadros solo donde juega el club tras la primera pasada; estado público calculado una vez (caché, ETag y 304);
  caché HTTP acotada; web dividida por páginas.

## Pendiente

| Elemento | Qué hay que aportar / hacer |
| --- | --- |
| Fotografía de grupo | Portada con la foto del equipo (hecha). Falta confirmar el consentimiento de las personas que aparecen para publicar su imagen. |
| Presentación del club | Texto incorporado desde el informe del club (`club.json › about`). Falta una foto complementaria. |
| Integrantes | Nombres, funciones y fotos, **con autorización** para publicarlos. Hoy: tarjetas de marcador. |
| Logros | Incorporados desde el informe del club (`achievements.json`). Cifras no respaldadas (p. ej. «17 medallas») no se muestran. |
| Historia | Cronología y fuentes incorporadas (`history.json`). Pendiente: origen/fundación del club y fotos históricas. |
| Participación de la UVa | Torneos donde juegan personas de la UVa (`uva-torneos.json`), con nº de jugadores y nombres autorizados. |
| Correo y redes | `club.json › email` y `socials`. Mientras estén vacíos no se muestran. |
| Formulario | Servicio de envío (`VITE_CONTACT_ENDPOINT`), correo de destino y captcha. Hoy no envía. |
| Textos legales | Redactados (aviso legal, privacidad, cookies). Faltan los datos del titular en `club.json › legal` (titular, NIF, domicilio, correo, contacto de protección de datos) y una revisión por la Universidad o un asesor jurídico. |
| Servidor | Alojarlo (Fly.io/VPS con disco), `ADMIN_TOKEN`, claves VAPID, `VITE_API_URL` en la web. |
| Autorización | Permiso de la FESBA / Federación de Castilla y León para activar la lectura en directo. |

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
