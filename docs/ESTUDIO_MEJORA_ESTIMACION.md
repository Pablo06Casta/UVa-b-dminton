# Estudio de mejora de la estimación: qué se ha aplicado y qué queda (24/10/2026)

Hoja de ruta recibida: mantener el simulador Monte Carlo y convertirlo en híbrido (restricciones reales, hueco estocástico entre partidos, calibración
conformal). Aquí se anota, fase a fase, lo hecho, cómo se validó y lo que NO se ha podido validar todavía y por qué.

## Hallazgo previo importante sobre la validación

El banco de pruebas (`server/tests/helpers/backtest.ts`) reconstruye el inicio «real» de cada partido con la propia lógica de una pista (empieza cuando
está libre + 3 min y no antes de su hora programada) porque los datos recogidos hasta ahora (`tests/data/real-days.json`) solo traen hora programada, pista,
duración y estado, **no** inicios reales. Por tanto el banco **no puede premiar** un hueco entre partidos distinto de 3 min ni un descanso entre partidos de
una misma persona: la «verdad» se construye sin ellos. Todo lo que dependa de esos dos efectos solo se puede validar con tiempos reales, que el servidor
empieza a guardar desde hoy (ver Fase 1-2).

## Fase 0 (hecha): métricas y comparación pareada

- `server/tests/helpers/metrics.ts`: pérdida pinball, puntuación de intervalo (Gneiting-Raftery) y comparación pareada con bootstrap por jornada + prueba de signos.
- `server/scripts/compare.ts`: valida dejando fuera un TORNEO completo, informa por tramo de avance (10-40, 40-70, 70-95 %), y separa un **conjunto reservado**
  (T11-T13: jornadas del 24/10/2026 de Estella, Utrillas y Viladecans) que solo se mira para confirmar lo decidido con T1-T10.
- Nueva regla de aceptación de cambios (sustituye a la de «≥3 % de MAE»): mejora ≥ 3 % en puntuación de intervalo o pinball medio; cota inferior del bootstrap
  pareado > 0; ningún tramo empeora > 2 %; cobertura 70-90 % en cada tramo; y confirmación en el conjunto reservado.
- Dato corregido: faltaba una jornada (Utrillas) en el conjunto del 24/10; ahora hay 14 jornadas reales (T11 Estella, T12 Utrillas, T13 Viladecans).

### Resultados con el banco
- Más simulaciones (1.000 en vez de 400): sin efecto medible (error de fin −0,1 %, intervalos −0,8 % en el reservado); se adopta porque estabiliza los percentiles
  y cuesta 30 ms por estimación con 260 partidos.
- Las jornadas saturadas (T4, T8, T11, T12: el último partido empezó 40-90 min después de su hora programada) quedan ≈ 15-40 min por debajo en mitad de jornada.
  Con ellas, el margen del 10-90 % acertaba solo el 69 % (< 70 %). Barrido del ancho (`spread`) con las 14 jornadas, pistas visibles:
  1,3 → cobertura 76 % · 1,45 → 79 % · **1,6 → 80,5 %** (puntuación de intervalo 90,0 frente a 91,2) · 1,8 → 83 %. Con pistas ocultas, de 1,3 a 1,6 la
  puntuación de intervalo baja un 4,8 % y la cobertura sube de 69,5 % a 72 %. **Adoptado: `spread` = 1,6.**
- Más incertidumbre del ritmo (paceTau ×2…×4) o de la dispersión (cv ×1,1): no mejora (MAE 16,1-16,3 frente a 15,7). No se aplica.
- Duración por fase: eliminatoria 29,2 min frente a 28,5 en grupos (+2,6 %); último tercio de eliminatorias 30,2 frente a 28,8 (+5 %): efecto pequeño. No se aplica
  (con 14 jornadas no supera el criterio).

## Publicación de horas (hecha)

Siguiendo la asimetría del coste (llegar tarde cuesta más que esperar):
- `starts` pasa a ser la **mediana** (antes percentil 0,6): es «lo más probable».
- Nuevo `startsEarly` = percentil 0,25: «podría empezar desde HH:MM» (`earliestStart` en la API pública).
- Los avisos push se programan con la hora más temprana («Ana podría jugar en 19 min · desde 11:40 · lo más probable 11:55»).
- El panel «Siguiente partido» muestra «Hora más probable» y «podría empezar desde las…».
- El fin de jornada mantiene el percentil 0,65 con su margen.

## Fases 1-2 (infraestructura hecha; se activan solas con datos suficientes)

- **Relación anónima de quién juega** (`slots.pids`): en cada lectura se asigna a cada persona un índice dentro del día (orden de su identificador, que no se
  guarda). Solo sirve para saber qué partidos comparten participante. Probado: no se almacena ningún identificador real.
- **Tiempos reales por jornada** (`day_patterns.json › timing`): por cada partido terminado, minutos desde el primer partido programado de su hora programada,
  pista (índice), prueba, duración, inicio real (punto medio entre lecturas), primera lectura como terminado, estado e índices de participantes. Es el conjunto de
  datos que permitirá, a partir de las próximas jornadas, un banco de pruebas con **inicios reales** (`/api/public/accuracy?timing=1`).
- **Hueco entre partidos aprendido** (`learnedTiming`): huecos entre partidos consecutivos de la misma pista, solo cuando la pista era el límite (el partido
  empezó > 2 min después de su hora programada) y sin pausas > 25 min. Con ≥ 150 huecos se remuestrean en la simulación (el simulador deja de usar un cambio fijo
  de 3 min). Con menos, comportamiento de siempre.
- **Descanso mínimo entre partidos de una misma persona**: percentil 5 del descanso observado, con ≥ 60 pares y ≥ 10 min (tope 45); el simulador no empieza el
  siguiente partido de alguien hasta que descansa. Con menos, no se aplica. No se ha fijado a 30/60 min porque en torneos territoriales puede renunciarse al descanso.
- Probado con pruebas unitarias sintéticas (el descanso retrasa el 2.º partido; los huecos largos retrasan el fin; sin datos suficientes no cambia nada).

## Fase 3 (hecha): calibración CQR + ACI

Sustituye a la heurística de `spread` aprendido. Para cada horizonte (≈120, 60 y 30 min del final) y con las jornadas ya medidas:
puntuación E = lo que se salió del margen mostrado (negativa si cayó dentro, ya corregido el desvío); corrección Q = cuantil conformal de nivel 1 − α_t de las
puntuaciones, con α_t adaptativo (ACI, paso γ = 0,02, nivel objetivo 80 %); Q ∈ [−20, +60] min se resta al límite inferior y se suma al superior. Mínimo 3 jornadas.
Prueba de cobertura a largo plazo (errores σ = 25 con margen ±10): el margen corregido acierta ≈ 80 % en jornadas nuevas.

## Pendiente (y por qué)

| Elemento | Estado | Motivo |
|---|---|---|
| Dependencias entre rondas (semifinal espera a sus cuartos) | No aplicado | Requiere mapear cada partido a su posición en el cuadro y, para validarlo, inicios reales. |
| Duración jerárquica (prueba × categoría × ronda), mezcla 2/3 juegos | No aplicado | El efecto de ronda medido es pequeño (+2,6 %); el número de juegos no se guarda por partido. Reevaluar con `timing`. |
| Anclaje del retraso por pista (estilo Kalman) | No aplicado | El simulador ya propaga el retraso por pista; se reevaluará con inicios reales. |
| Gradient boosting de cuantiles sobre residuos | Aplazado | Solo compensa con > 50-100 jornadas (hoy: 14). |
| Validar hueco y descanso con inicios reales | A partir de las próximas jornadas | Primera ocasión: fin de semana del 31/10 con `timing` acumulado. |

## Riesgo de sobreajuste (agente de IA sobre 14 jornadas)

Mitigaciones en vigor: conjunto reservado (T11-T13) que no se usa para diseñar; la regla de aceptación exige confirmación en él; cada cambio de parámetros
fijos se documenta aquí; y las mejoras que dependen de datos reales (hueco, descanso, conformal) solo se activan cuando hay muestra suficiente.
