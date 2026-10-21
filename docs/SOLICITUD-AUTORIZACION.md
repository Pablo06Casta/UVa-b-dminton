# Solicitud de autorización de acceso a datos de competición

*Borrador para enviar a la Federación Española de Bádminton (FESBA) y a la Federación de Castilla y León. Completa los datos
entre corchetes y revísalo antes de enviarlo.*

**Asunto:** Solicitud de autorización para la lectura automatizada de datos públicos de competición — Club Bádminton Universidad de Valladolid

Estimados señores:

Les escribimos en nombre del Club Bádminton de la Universidad de Valladolid ([nombre y cargo], [correo], [teléfono]). Estamos
desarrollando la página web del club, en la que queremos mostrar, para los jugadores del club que han dado su consentimiento
expreso, los torneos en los que participan, sus partidos, resultados y los grupos y cuadros correspondientes, de modo que
familiares y aficionados puedan seguirlos.

Esos datos ya se publican en badminton.es (Tournament Software). Hemos comprobado que el `robots.txt` del sitio excluye el acceso
automatizado a las rutas donde se publican (`/sport/`, `/tournament/`, `/profile/`, `/player/`) y no existe una API pública ni
un formato de intercambio (iCal, RSS). Por ello **les solicitamos autorización expresa por escrito**, o que nos indiquen el cauce
oficial que prefieran (API, exportación de datos u otro), para lo siguiente:

**Qué leeríamos** (solo lectura, solo de torneos en los que figure algún jugador del club):
- Ficha del torneo, lista de cuadros, clasificaciones de grupo y cuadros eliminatorios.
- Orden de juego de cada día de competición.
- Perfil oficial de cada jugador de nuestra lista cerrada (actualmente [N] jugadores) para localizar sus torneos.

**Cómo lo haríamos:**
- Desde un único servidor del club, con un `User-Agent` que identifica al club y un correo de contacto.
- **Una petición como máximo cada 2,5 segundos**, con caché y detección de cambios, y se leería una sola vez por torneo (no una
  por jugador). Parada automática ante respuestas 429 o de error del servidor.
- Frecuencia: cada pocas horas antes de un torneo, y cada 3 minutos solo durante las jornadas de competición. Fuera de ellas,
  prácticamente ninguna. Volumen estimado: [unos cientos] de peticiones por día de torneo.
- Sin recorrer el sitio completo, sin consultar rankings generales ni buscadores de jugadores.

**Protección de datos:** solo se publican nombres y resultados de jugadores del club que han consentido (en menores, con el
consentimiento de su familia o tutores). Los rivales no se publican por nombre y los demás participantes de los cuadros se
muestran con iniciales. El club atenderá cualquier solicitud de supresión.

Agradeceremos su respuesta, así como las condiciones que deseen imponer (frecuencia máxima, horarios, atribución de la fuente
u otras), que cumpliremos. Mientras no dispongamos de autorización, no realizaremos ninguna lectura automatizada de esas rutas.

Atentamente,

[Nombre, cargo, Club Bádminton Universidad de Valladolid]
