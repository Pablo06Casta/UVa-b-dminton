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

Hecho y probado con una fuente simulada (la implementación contra badminton.es de los lectores de torneo está pendiente, ver abajo):

- Lista de jugadores con consentimiento + panel `/admin`; descubrimiento de torneos desde el perfil oficial.
- Lectura de una vez por torneo, frecuencias por fase (orden de juego cada 5 min en jornada), confirmación de cambios con
  2 lecturas, registro de cambios, antigüedad de los datos.
- Estimación de la hora de fin del torneo y de cada partido; cuadros; avisos push N min antes; enlaces para compartir.
- Web: página **Directo** (en juego / próximos / resultados, hora de fin en grande, cuadros, avisos, compartir).

Importante:

- **Lectores de páginas de torneo: pendientes.** Se retiró el código que venía de otro repositorio; el calendario tiene lectores
  propios y verificados, pero los de torneo, cuadros, partidos y perfiles no existen aún. Para escribirlos hace falta ver esas
  páginas: o bien con autorización de la federación, o bien con páginas guardadas desde el navegador por el club.
- **La lectura en directo está DESACTIVADA por defecto** (`OFFICIAL_READ_ENABLED=false`): las rutas de inscritos, cuadros,
  partidos y perfiles están excluidas por el `robots.txt` de badminton.es. Activarla es decisión del club; se recomienda
  autorización de la FESBA / Federación de Castilla y León. **No se ha ejecutado contra badminton.es** más que el calendario.
- Requiere alojar el servidor (ver `server/README.md`) y definir `VITE_API_URL` en la web.

## Pendiente

| Elemento | Qué hay que aportar / hacer |
| --- | --- |
| Fotografía de grupo | Foto oficial del equipo para la portada (hoy: ilustración provisional, con aviso visible). |
| Presentación del club | Texto real en `club.json › about` y foto complementaria. |
| Integrantes | Nombres, funciones y fotos, **con autorización** para publicarlos. Hoy: tarjetas de marcador. |
| Logros | Datos verificables en `achievements.json` (hoy: "Dato pendiente"). |
| Historia | Textos, hitos con fecha y fuente, fotos históricas (`history.json`). No se ha inventado nada. |
| Participación de la UVa | Torneos donde juegan personas de la UVa (`uva-torneos.json`), con nº de jugadores y nombres autorizados. |
| Correo y redes | `club.json › email` y `socials`. Mientras estén vacíos no se muestran. |
| Formulario | Servicio de envío (`VITE_CONTACT_ENDPOINT`), correo de destino y captcha. Hoy no envía. |
| Textos legales | Aviso legal y política de privacidad (responsable, finalidad, derechos…) en `LegalPage.tsx`. |
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
