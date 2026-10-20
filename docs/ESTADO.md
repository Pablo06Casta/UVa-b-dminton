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

## Pendiente

| Elemento | Qué hay que aportar / hacer |
| --- | --- |
| Fotografía de grupo | Foto oficial del equipo para la portada (hoy: ilustración provisional, con aviso visible). |
| Presentación del club | Texto real en `club.json › about` y foto complementaria. |
| Integrantes | Nombres, funciones y fotos, **con autorización** para publicarlos. Hoy: tarjetas de marcador. |
| Logros | Datos verificables en `achievements.json` (hoy: "Dato pendiente"). |
| Historia | Textos, hitos con fecha y fuente, fotos históricas (`history.json`). No se ha inventado nada. |
| Torneos | Calendario real. Los 6 torneos actuales son **ejemplos** marcados "Provisional": eliminarlos. |
| Correo y redes | `club.json › email` y `socials`. Mientras estén vacíos no se muestran. |
| Formulario | Servicio de envío (`VITE_CONTACT_ENDPOINT`), correo de destino y captcha. Hoy no envía. |
| Textos legales | Aviso legal y política de privacidad (responsable, finalidad, derechos…) en `LegalPage.tsx`. |
| Integración oficial | Estudiar una fuente de datos autorizada (no se ha asumido que exista ninguna API). |

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
