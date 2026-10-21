/**
 * Compara la estimación con lo que pasó en torneos reales terminados (datos anónimos en tests/data/real-days.json).
 *   npx tsx scripts/backtest.ts
 * Los valores a priori se calculan SIN la jornada evaluada (validación «dejando uno fuera»).
 */
import { estimate as current, defaultEstimateConfig } from '../src/estimate';
import { estimate as legacy } from '../tests/helpers/legacyEstimate';
import { priorsWithout, realDays, replay, summarize, type Checkpoint, type Estimator } from '../tests/helpers/backtest';

const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-').padStart(6);
const days = realDays();

function run(name: string, est: Estimator, courtsVisible: boolean, cfgFor: (id: string) => Parameters<Estimator>[2]) {
  const points: Checkpoint[] = days.flatMap((d) => replay(d, est, cfgFor(d.id), { courtsVisible }));
  console.log(`\n${name} · pistas ${courtsVisible ? 'visibles' : 'ocultas'} · ${points.length} lecturas simuladas (una cada 15 min)`);
  console.log('tramo del torneo       lect.  error fin (min)  sesgo fin  margen acierta  error inicio  sesgo inicio');
  for (const s of summarize(points)) {
    console.log(`${s.bucket.padEnd(22)} ${String(s.n).padStart(4)} ${f(s.endMAE)}        ${f(s.endBias)}     ${f(s.coverage * 100, 0)}%      ${f(s.startMAE)}      ${f(s.startBias)}`);
  }
}

for (const visible of [false, true]) {
  run('ANTERIOR', legacy as Estimator, visible, () => ({ defaultMatchMin: 35, changeoverMin: 4, simulations: 300 }));
  run('ACTUAL  ', current as Estimator, visible, (id) => ({ ...defaultEstimateConfig, priors: priorsWithout(days, id) }));
}
