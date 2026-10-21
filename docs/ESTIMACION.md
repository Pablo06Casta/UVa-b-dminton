# Estimación del avance del torneo

Código: `server/src/estimate.ts`. Se recalcula con cada lectura del orden de juego (cada 3 min en jornada) usando solo datos
anónimos del torneo (hora programada, pista, estado y duración publicada de cada partido).

## Qué calcula

- **Hora de inicio** estimada de cada partido pendiente (mediana de la simulación; se muestra con la etiqueta **EST**).
- **Hora de fin** del torneo y su **margen probable** (calibrado para acertar en torno al 80 %).
- Ritmo observado: duración media, retraso respecto a lo programado, pistas.

## Cómo funciona

1. **Valores de partida medidos en 1.299 partidos reales** de 11 jornadas de torneos absolutos españoles (2026): duración media por
   prueba (IM 28,3 · IF 26,2 · DM 31,2 · DF 30,9 · DX 29,5 min), dispersión (CV 0,32) y W.O. (7,4 %). Antes se suponían 35 min.
2. **Ritmo del propio torneo** (bayesiano): con pocos partidos terminados manda lo habitual; con muchos, lo observado. Los torneos
   se diferencian en ±7 % de ritmo, y esa incertidumbre entra en la simulación.
3. **W.O.:** la proporción de «no hay partido» también se aprende del torneo; esos partidos no ocupan pista.
4. **Partido en juego:** no puede acabar antes de lo que ya lleva jugado (distribución condicionada).
5. **Pistas:** cada una atiende sus partidos en orden y no empieza antes de la hora programada. Sin pistas publicadas, su número
   se deduce de cuántos partidos coinciden a la misma hora.
6. **Simulación:** 400 repeticiones de lo que queda de jornada (≈12 ms). Hora estimada = percentil 65 (fin) / 60 (inicio),
   ligeramente prudente; margen = percentiles 10-90 ensanchados ×1,3.

## Cómo se ha comprobado (con torneos reales)

`tests/data/real-days.json` guarda datos anónimos (sin nombres) de 10 jornadas terminadas. `tests/helpers/backtest.ts` reconstruye
cada jornada y la «reproduce» con lecturas cada 15 min, pidiendo al estimador lo que sabría en directo y comparándolo con lo ocurrido.
Los valores de partida se calculan **sin la jornada evaluada** (validación «dejando uno fuera»).

Resultado (error medio de la hora de fin, en minutos; pistas sin publicar):

| Tramo del torneo | Estimador anterior | Actual |
| --- | ---: | ---: |
| Antes de empezar | 82 | 27 |
| 10-40 % | 23 | 18 |
| 40-70 % | 18 | 17 |
| 70-95 % | 15 | 15 (9 si las pistas están publicadas) |

El error de la hora de inicio de cada partido baja de ~35 a ~19 min de media. El margen probable acierta entre el 73 % y el 93 %.
Los límites de calidad están fijados en `tests/estimateBacktest.test.ts`: si algo empeora la estimación, fallan las pruebas.

```
cd server
npx tsx scripts/backtest.ts                     # compara con el estimador anterior
npx tsx scripts/harvest-matches.ts datos.json GUID…   # recoge más torneos terminados (anónimos)
```

## Límites conocidos

- El inicio real de cada partido no se publica: la «verdad» de la prueba se reconstruye a partir de las pistas y duraciones reales.
- Un solo partido largo (la final) mueve la hora de fin 10-15 min: es ruido inevitable.
- Con el torneo en marcha, la estimación mejora sola; para afinarla más hace falta guardar lo que el servidor observa en directo.
