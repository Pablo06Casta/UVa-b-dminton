/**
 * Compara variantes de la estimación frente a la base con el criterio del estudio de mejora (Fase 0):
 * validación dejando fuera un TORNEO completo, métricas por jornada (MAE, pinball de los cuantiles publicados, puntuación de intervalo,
 * cobertura), por tramo de avance, y comparación pareada con bootstrap + prueba de signos. El conjunto reservado (T11-T13: jornadas
 * del 24/10/2026) solo se mira para CONFIRMAR lo decidido con T1-T10.
 *   npx tsx scripts/compare.ts                 (variantes de ejemplo)
 *   npx tsx scripts/compare.ts '{"name":{"endQuantile":0.7}}'   (variantes propias: parámetros de EstimateConfig)
 */
import { defaultEstimateConfig, estimate, type EstimateConfig } from '../src/estimate';
import { priorsWithout, realDays, replay, type Checkpoint, type Estimator, type RealDay } from '../tests/helpers/backtest';
import { intervalScore, paired, pinball } from '../tests/helpers/metrics';

const days = realDays();
const RESERVED = new Set(['T11', 'T12', 'T13']);
const MIN = 60_000;

interface Row { endMAE: number; endPin: number; endIS: number; cover: number; startPin25: number; startPin50: number; startMAE: number; n: number }

function score(day: RealDay, cfg: Partial<EstimateConfig>, bucket: [number, number]): Row | undefined {
  const full = { ...defaultEstimateConfig, simulations: 300, priors: priorsWithout(days, day.id), ...cfg } as EstimateConfig;
  const pts: Checkpoint[] = replay(day, estimate as Estimator, full, { courtsVisible: true }).filter((p) => p.progress >= bucket[0] && p.progress < bucket[1]);
  if (!pts.length) return undefined;
  const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const tau = full.endQuantile ?? 0.5;
  return {
    endMAE: m(pts.map((p) => Math.abs(p.predictedEnd - p.trueEnd) / MIN)),
    endPin: m(pts.map((p) => pinball(tau, p.predictedEnd / MIN, p.trueEnd / MIN))),
    endIS: m(pts.map((p) => intervalScore(p.low / MIN, p.high / MIN, p.trueEnd / MIN))),
    cover: m(pts.map((p) => (p.low <= p.trueEnd && p.trueEnd <= p.high ? 1 : 0))),
    startPin25: m(pts.flatMap((p) => p.startBias).map((e) => pinball(0.25, 0, -e))), // error = estimada − real: y_real − pred = −e
    startPin50: m(pts.flatMap((p) => p.startBias).map((e) => pinball(0.5, 0, -e))),
    startMAE: m(pts.flatMap((p) => p.startErrors)),
    n: pts.length,
  };
}

const BUCKETS: [string, [number, number]][] = [['10-40 %', [0.1, 0.4]], ['40-70 %', [0.4, 0.7]], ['70-95 %', [0.7, 0.95]]];
const variants: Record<string, Partial<EstimateConfig>> = process.argv[2] ? JSON.parse(process.argv[2]) : { 'más simulaciones (1000)': { simulations: 1000 }, 'inicio en la mediana (q=0,5)': { startQuantile: 0.5 } };
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');

for (const [setName, ids] of [['DISEÑO (T1-T10)', days.filter((d) => !RESERVED.has(d.id))], ['RESERVADO (T11-T13)', days.filter((d) => RESERVED.has(d.id))]] as const) {
  console.log(`\n===== ${setName}: ${ids.length} jornadas =====`);
  for (const [bn, range] of [['TODO ≥10 %', [0.1, 0.95]] as [string, [number, number]], ...BUCKETS]) {
    const base = ids.map((d) => score(d, {}, range));
    const ok = base.map((b) => !!b);
    const bs = base.filter(Boolean) as Row[];
    console.log(`\n[${bn}] base: error de fin ${f(bs.reduce((a, r) => a + r.endMAE, 0) / bs.length, 1)} min · pinball fin ${f(bs.reduce((a, r) => a + r.endPin, 0) / bs.length)} · int. ${f(bs.reduce((a, r) => a + r.endIS, 0) / bs.length, 1)} · cobertura ${f((bs.reduce((a, r) => a + r.cover, 0) / bs.length) * 100, 0)} % · inicio MAE ${f(bs.reduce((a, r) => a + r.startMAE, 0) / bs.length, 1)}`);
    for (const [name, cfg] of Object.entries(variants)) {
      const cand = ids.map((d, i) => (ok[i] ? score(d, cfg, range) : undefined));
      const pick = (g: (r: Row) => number) => ({ b: bs.map(g), c: (cand.filter(Boolean) as Row[]).map(g) });
      const line = (label: string, g: (r: Row) => number) => {
        const { b, c } = pick(g);
        const r = paired(b, c);
        return `${label} ${f(r.relDiff * 100, 1)} % [${f((r.lo / (b.reduce((x, y) => x + y, 0) / b.length)) * 100, 1)}…${f((r.hi / (b.reduce((x, y) => x + y, 0) / b.length)) * 100, 1)}] (${r.better}↑/${r.worse}↓)`;
      };
      const cov = (cand.filter(Boolean) as Row[]).reduce((a, r) => a + r.cover, 0) / Math.max(1, cand.filter(Boolean).length);
      console.log(`  · ${name}: ${line('fin MAE', (r) => r.endMAE)} | ${line('pinball fin', (r) => r.endPin)} | ${line('int.', (r) => r.endIS)} | ${line('inicio MAE', (r) => r.startMAE)} | cobertura ${f(cov * 100, 0)} %`);
    }
  }
}
console.log('\n(% negativo = el candidato mejora; entre corchetes, intervalo bootstrap 95 % de la mejora relativa; ↑/↓ jornadas que mejoran/empeoran)');
