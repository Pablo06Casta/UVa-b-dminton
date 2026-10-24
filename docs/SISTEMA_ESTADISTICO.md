# Sistema estadístico de la web del Club Bádminton UVa (explicado para una IA)

Documento autónomo: describe qué hace el sistema estadístico, para qué sirve, qué datos usa, qué mide y cómo aprende. Todo está en
`server/src/` (Node 22, TypeScript). No contiene datos personales: solo horas y recuentos.

## 1. Contexto y para qué sirve

El Club Bádminton Universidad de Valladolid compite en torneos de la federación española (badminton.es). La web del club
(https://badmiton-uva.github.io/UVa-b-dminton/) y su servidor (https://club-uva-badminton.onrender.com) muestran en directo los partidos de los
jugadores de la UVa. Un torneo publica su **orden de juego** (partidos con hora programada, pista, prueba y estado), pero las horas programadas
no se cumplen: hay retrasos, partidos que duran más o menos y W.O. El sistema estadístico responde, mientras el torneo está en marcha, a tres preguntas:

1. **¿A qué hora terminará el torneo hoy?** (hora estimada de fin, con un margen probable).
2. **¿A qué hora empezará cada partido que aún no ha empezado?** (hora estimada de inicio, distinta de la oficial).
3. **¿Cuántos partidos van antes que el siguiente partido de la UVa?** (sirve para avisar a las familias y jugadores).

Es una **previsión probabilística**, siempre presentada como estimación («EST»), nunca como dato oficial.

## 2. Datos de entrada (anónimos)

Cada partido de un día de torneo es un *slot* (tabla `slots`):

| Campo | Significado |
|---|---|
| `planned_utc` | hora programada oficial |
| `court` | pista (si ya está asignada) |
| `event` | prueba: IM (individual masculino), IF (individual femenino), DM, DF, DX (dobles masculino, femenino, mixto) |
| `status` | `scheduled`, `on_court`, `finished`, `walkover` (W.O.), `retired`, `unknown` |
| `duration_min` | duración publicada de los partidos terminados |
| `started_seen_at`, `prev_poll_at` | primera lectura en que se vio en pista y la lectura anterior (el inicio real está entre ambas) |
| `finished_seen_at` | primera lectura en que se vio terminado |

El servidor lee la federación cada pocos minutos con peticiones espaciadas (≥ 2,5 s) y guarda todos los partidos del torneo (no solo los del club).
Los nombres de personas **no** intervienen en la estimación.

## 3. El modelo de estimación (`estimate.ts`)

Simulación de Monte Carlo (1.000 repeticiones, semilla determinista: misma entrada → misma estimación). En cada repetición se «juega» el resto del día:

1. **Duración de un partido**: log-normal. Su media depende de la prueba (valores de partida: IM 28,7 · IF 26,2 · DM 31,5 · DF 31,1 · DX 29,1 min;
   media global 28,9; coeficiente de variación 0,326) multiplicada por el **ritmo del torneo**.
2. **Ritmo del torneo** (rápido/lento frente a lo habitual): estimación bayesiana. Se compara lo que han tardado los partidos ya terminados con lo esperable
   y se mezcla con lo a priori; con pocos partidos manda el a priori, con muchos mandan los observados. Su incertidumbre (`paceTau` ≈ 7 % entre torneos)
   entra en la simulación (cada repetición usa un ritmo ligeramente distinto).
3. **W.O.**: proporción a priori 7,6 % (se actualiza con lo observado). Un W.O. dura 0 y no ocupa pista: se resuelve a la hora programada.
4. **Partido en pista**: no puede acabar antes de lo que ya lleva jugado (se condiciona a ese tiempo transcurrido).
5. **Pistas**: si todos los partidos pendientes ya traen pista, cada uno va a la suya; si no, entran en la primera pista libre. El número de pistas es el
   de pistas publicadas o, como mínimo, cuántos partidos coinciden a la misma hora programada.
6. **Orden y holgura**: cada pista atiende sus partidos en orden; un partido empieza en `max(pista libre + hueco, hora programada, ahora, descanso)`.
   El hueco es de 3 min o, cuando hay ≥150 huecos reales medidos, una muestra de ellos; el descanso (10 min programados entre dos partidos de una misma persona, confirmado por el club; si los tiempos reales muestran un mínimo mayor, manda ese). La hora programada es siempre un suelo (nadie empieza antes).
7. **Resultado de la repetición**: hora del último partido que acaba.

**Salidas** (tras las 400 repeticiones):
- `estimatedEnd` = percentil 0,65 de la hora de fin (algo prudente: mejor llegar un poco tarde que dar una hora imposible).
- `estimatedEndLow`/`High` = margen probable: percentiles 10 y 90 respecto a la mediana, ampliados por `spread` = 1,6 (medido con 14 jornadas reales para que acierte ≈80 %).
- `starts[partido]` = mediana de la hora de inicio de cada partido pendiente («lo más probable»); `startsEarly[partido]` = percentil 0,25 («podría empezar desde»).
- Diagnóstico: duración media observada, reserva por partido (mediana del hueco entre partidos programados en la misma pista), retraso medio
  (mediana de inicio real − programado), pistas, partidos terminados/en juego/pendientes.
- `ahead` (en `publicView.ts`): para cada partido pendiente del club, cuántos partidos pendientes de todo el torneo van antes, ordenados por hora estimada
  (los W.O. no cuentan).

**Cierre de la jornada** (para que ningún torneo se quede «sin terminar»):
- Se retiran los *partidos fantasma*: pendientes que la fuente ya no publica (cambian de clave al asignarse jugadores, se suspenden o se reordenan).
- Jornada abandonada: nada en pista, sin actividad en 2 h y todos los pendientes programados hace más de 1 h → se da por terminada a la hora del último partido.
- Un barrido cada 5 min recalcula el último día de los torneos no terminados; un día anterior que seguía «por jugar» se publica como terminado.

## 4. Qué se mide (`accuracy.ts`)

El servidor guarda cada 10 min el día del torneo (cada 3 h los días previos) una «foto» de la estimación: `estimate_log` (hora de fin, margen, partidos
terminados/pendientes) y `estimate_starts` (hora estimada de inicio de cada partido). Cuando una jornada termina, se compara con lo que pasó de verdad
(`/api/public/accuracy`):

- **Hora de fin**: error = estimada − real (minutos, + = la estimación llegó tarde) tomado a 240, 120, 60 y 30 min del final real y antes de empezar la
  jornada; y si la hora real cayó **dentro del margen probable** (`inRange`).
- **Hora de inicio de cada partido** a 60, 30 y 15 min de empezar, para todos los partidos y para los del club: n, sesgo, error absoluto medio (mae),
  mediana, p80 y % de casos dentro de ±10, ±15 y ±30 min.
- **Línea base**: lo mismo con la hora programada oficial (¿mejora la estimación al plan?).
- El inicio real de un partido es el punto medio entre la lectura anterior y la primera en que se vio en pista; el fin real es el máximo de `finished_seen_at`.

Referencia con 14 jornadas reales (validación «dejando uno fuera», lectura cada 15 min): error absoluto medio de la hora de fin ≈ **15,9 min**; el margen
probable acierta ≈ **80 %**; por tramo del torneo, el error de fin baja de ≈ 22 min (10-40 % del avance) a ≈ 10 min (70-95 %), con un sesgo a llegar
pronto a mitad de jornada (≈ −15 min) que desaparece al final.

## 5. Cómo aprende de cada torneo

Tres mecanismos, todos prudentes (con pocos datos casi no corrigen) y con mínimo de **3 jornadas terminadas**:

1. **Patrones de jornada** (`patterns.ts`, tabla `day_patterns`): al terminar cada jornada se guarda un resumen anónimo (partidos, jugados, W.O.,
   duración por prueba, ritmo, retraso, pistas, fin real frente al programado, errores de fin a 120/60/30 min con la anchura del margen, sesgo de inicio a 30 min).
2. **Valores de partida aprendidos** (`learnedPriors`): duración media por prueba, W.O., dispersión y variación de ritmo entre torneos se reajustan mezclando
   lo de fábrica con lo observado (pesos: 150 partidos por prueba, 600 globales, 300 para W.O. y dispersión; 4 jornadas para la variación del ritmo).
3. **Calibración** (`calibration.ts`): corrige lo publicado, no el registro.
   - Desvío de fin = −mediana del error medio de cada jornada × n/(n+4), con tope de ±20 min; desvío de inicio igual con tope de ±8 min.
   - Anchura del margen: regresión cuantílica conformalizada (CQR) con nivel adaptativo (ACI), por horizonte (≈120, 60 y 30 min del final): corrección en minutos
     que se resta al límite inferior y se suma al superior (entre −20 y +60), para que el margen acierte ≈80 % a largo plazo.
   - Se registra siempre la estimación **en bruto**, de modo que corregir no falsea el aprendizaje.

Regla de ingeniería para cambiar parámetros fijos (`endQuantile`, `startQuantile`, `changeoverMin`, `spread`, valores de partida): solo si el error de fin
mejora ≥ 3 % en el banco de pruebas (`server/scripts/backtest.ts`, datos reales anónimos en `server/tests/data/real-days.json`), ningún tramo empeora más
de un 2 % y el margen sigue acertando entre el 70 y el 90 %.

## 6. Dónde se usa

- **Directo** (web): hora estimada de fin del torneo con su margen, y panel «Siguiente partido de la UVa»: partidos que van antes, tiempo hasta empezar,
  hora oficial y hora estimada con su diferencia.
- **Inicio**: «Así vamos en los torneos» (quién juega ahora, próximos con hora estimada, fin estimado) mientras el torneo está en marcha.
- **Imágenes para redes**: etiqueta EST en la jornada por horas y en las capturas del itinerario (correo 15 min antes de empezar).
- **Avisos push**: «juega en unos N min» calculado con la hora estimada.
- **Informe semanal por correo** (sábados y domingos 21:00): un agente lee `/api/public/accuracy` y resume el acierto y lo aprendido.

## 7. Límites conocidos

- Depende de que la federación publique el orden de juego del día; sin él no hay estimación (o es muy tosca).
- No modela dependencias entre rondas (una semifinal no empieza hasta que acaban sus cuartos); las horas programadas de las rondas finales son provisionales.
- A mitad de jornada tiende a llegar pronto (≈ 15 min) y el margen es algo estrecho en esa fase; el aprendizaje por jornada lo corrige poco a poco.
- Los primeros torneos tras un cambio no tienen aprendizaje (se usan los valores de fábrica). Las estimaciones guardadas antes del 24/10/2026 se descartaron
  porque los partidos fantasma las inflaban.
- Es una previsión: la duración de un partido concreto tiene mucha varianza (cv ≈ 33 %).

## 8. Glosario

- **Slot**: un partido del orden de juego. **Jornada/día**: conjunto de slots de una fecha de un torneo.
- **EST**: estimación (frente a «oficial»). **Margen probable**: intervalo de la hora de fin del que se espera acertar ≈ 80 %.
- **Sesgo**: error medio con signo (+ = la estimación llega tarde). **MAE**: error absoluto medio.
- **W.O.**: partido sin jugar (walkover). **Fantasma**: partido pendiente que la fuente ya no publica.
