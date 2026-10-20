/** Fechas ISO (YYYY-MM-DD) sin dependencias. */

const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** «31/01/2026» → «2026-01-31». */
export function parseDMY(s: string): string | undefined {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? iso(y, mo, d) : undefined;
}

/** Fecha de «hoy» en una zona horaria (por defecto, la de España). */
export const todayIn = (tz = 'Europe/Madrid', now: Date = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);

const toUtc = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const addDays = (s: string, n: number): string => {
  const d = new Date(toUtc(s) + n * 86_400_000);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};
export const daysBetween = (a: string, b: string): number => Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
export const eachDay = (start: string, end: string): string[] => {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
};
