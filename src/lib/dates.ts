/** Utilidades de fechas ISO (YYYY-MM-DD) sin dependencias. Se opera en fecha local, sin horas. */

export const toISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseISO = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const monthKey = (iso: string): string => iso.slice(0, 7);

export const addDays = (iso: string, days: number): string => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const formatMonth = (key: string): string =>
  capitalize(new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(parseISO(`${key}-01`)));

export const formatDay = (iso: string): string =>
  new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(parseISO(iso));

export const formatDateRange = (start: string, end?: string): string => {
  if (!end || end === start) return formatDay(start);
  const a = parseISO(start);
  const b = parseISO(end);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${formatDay(end)}`;
  }
  return `${formatDay(start)} – ${formatDay(end)}`;
};

export const shortMonth = (iso: string): string =>
  new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(parseISO(iso)).replace('.', '').toUpperCase();

export const dayOfMonth = (iso: string): string => String(parseISO(iso).getDate());

/** Devuelve los ISO de todos los días entre dos fechas, ambas incluidas. */
export const eachDay = (start: string, end: string): string[] => {
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
};

/**
 * Cuadrícula de un mes con semanas de lunes a domingo (6 filas máximo).
 * Los días fuera del mes se devuelven igualmente para completar las semanas.
 */
export const monthGrid = (key: string): { iso: string; inMonth: boolean }[] => {
  const first = parseISO(`${key}-01`);
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const start = addDays(toISO(first), -offset);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const total = Math.ceil((offset + lastDay.getDate()) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const iso = addDays(start, i);
    return { iso, inMonth: monthKey(iso) === key };
  });
};

export const shiftMonth = (key: string, delta: number): string => {
  const d = parseISO(`${key}-01`);
  d.setMonth(d.getMonth() + delta);
  return toISO(d).slice(0, 7);
};
