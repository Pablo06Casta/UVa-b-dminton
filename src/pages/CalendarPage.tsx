import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { MonthGrid } from '../components/tournaments/MonthGrid';
import { TournamentCard } from '../components/tournaments/TournamentCard';
import { TournamentDialog } from '../components/tournaments/TournamentDialog';
import { Notice, PageHeader } from '../components/ui';
import { useTournaments } from '../hooks/useTournaments';
import { usePageTitle } from '../hooks/usePageTitle';
import { formatDay, formatMonth, monthKey, shiftMonth, toISO } from '../lib/dates';
import {
  applyFilters,
  endOf,
  getCategories,
  hasUvaPlayers,
  statusLabels,
  type TournamentFilters,
} from '../lib/tournaments';
import type { TournamentStatus } from '../types';

type View = 'calendar' | 'list';

export function CalendarPage() {
  usePageTitle('Calendario');
  const { status, tournaments: allTournaments, checkedAt, sourceLabel, note } = useTournaments();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = toISO(new Date());
  const thisMonth = monthKey(today);

  const [view, setView] = useState<View>('calendar');
  const [month, setMonth] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<TournamentStatus | 'all'>('all');
  const [category, setCategory] = useState<string>('all');
  const [onlyUva, setOnlyUva] = useState(true);
  const tournaments = useMemo(
    () => (onlyUva ? allTournaments.filter(hasUvaPlayers) : allTournaments),
    [allTournaments, onlyUva],
  );

  const visibleMonth = month === 'all' ? thisMonth : month;
  const categories = useMemo(() => getCategories(tournaments), [tournaments]);
  const monthOptions = useMemo(() => {
    const keys = new Set<string>([thisMonth, visibleMonth]);
    for (const t of tournaments) {
      for (let k = monthKey(t.startDate); k <= monthKey(endOf(t)); k = shiftMonth(k, 1)) keys.add(k);
    }
    return [...keys].sort();
  }, [tournaments, thisMonth, visibleMonth]);

  const base = { status: statusFilter, category } satisfies Omit<TournamentFilters, 'month'>;
  const listItems = applyFilters(tournaments, { ...base, month }, today);
  const gridItems = applyFilters(tournaments, { ...base, month: 'all' }, today);
  const agendaItems = applyFilters(tournaments, { ...base, month: visibleMonth }, today);

  const selected = allTournaments.find((t) => t.id === searchParams.get('torneo')) ?? null;
  const closeDialog = () =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('torneo');
        return next;
      },
      { replace: true },
    );

  const filtersActive = statusFilter !== 'all' || category !== 'all' || (view === 'list' && month !== 'all');
  const clearFilters = () => {
    setStatusFilter('all');
    setCategory('all');
    setMonth('all');
  };

  const hasProvisional = tournaments.some((t) => t.provisional);
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof listItems>();
    for (const t of listItems) {
      const key = monthKey(t.startDate);
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return [...groups.entries()];
  }, [listItems]);

  return (
    <>
      <PageHeader
        sport
        title="Calendario"
        lead="Competiciones en las que participa el Club Bádminton Universidad de Valladolid."
      />
      <div className="section">
        <div className="container">
          {hasProvisional && (
            <Notice kind="warning" title="Competiciones provisionales">
              Los torneos marcados como «Provisional» son datos de ejemplo para mostrar el funcionamiento del
              calendario. Se sustituirán por las competiciones reales cuando el club las facilite.
            </Notice>
          )}

          <div className="toolbar">
            <div className="segmented" role="group" aria-label="Vista del calendario">
              <button type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>
                <Icon name="calendar" size={18} /> Calendario
              </button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                Lista
              </button>
            </div>

            <div className="filters">
              <label>
                <span>Mes</span>
                <select
                  value={view === 'list' ? month : visibleMonth}
                  onChange={(e) => setMonth(e.target.value)}
                >
                  {view === 'list' && <option value="all">Todos los meses</option>}
                  {monthOptions.map((k) => (
                    <option key={k} value={k}>
                      {formatMonth(k)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={onlyUva} onChange={(e) => setOnlyUva(e.target.checked)} />
                <span>Solo con jugadores de la UVa</span>
              </label>
              <label>
                <span>Estado</span>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TournamentStatus | 'all')}>
                  <option value="all">Todos</option>
                  {(Object.keys(statusLabels) as TournamentStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {statusLabels[s]}
                    </option>
                  ))}
                </select>
              </label>
              {categories.length > 0 && (
                <label>
                  <span>Ámbito</span>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="all">Todas</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {filtersActive && (
                <button type="button" className="link-button" onClick={clearFilters}>
                  Quitar filtros
                </button>
              )}
            </div>
          </div>

          {status === 'ready' && checkedAt && (
            <p className="source-note source-note--top">
              Calendario oficial de torneos absolutos, nacionales y territoriales. Fuente: {sourceLabel}. Última
              comprobación: {formatDay(toISO(new Date(checkedAt)))}. {note}
            </p>
          )}

          {status === 'ready' && onlyUva && tournaments.length === 0 && (
            <Notice title="Todavía no hay torneos con jugadores de la UVa registrados">
              La lista de inscritos de badminton.es no indica el club, así que la participación de la UVa la registra el
              club. Desactiva «Solo con jugadores de la UVa» para ver el calendario oficial completo.
            </Notice>
          )}

          <div aria-live="polite">
            {status === 'loading' && <p className="empty">Cargando competiciones…</p>}
            {status === 'error' && <p className="empty">No se han podido cargar las competiciones.</p>}
          </div>

          {status === 'ready' && view === 'calendar' && (
            <section aria-labelledby="month-title">
              <div className="month-head">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setMonth(shiftMonth(visibleMonth, -1))}
                >
                  <Icon name="chevron-left" />
                  <span className="sr-only">Mes anterior</span>
                </button>
                <h2 id="month-title" aria-live="polite">
                  {formatMonth(visibleMonth)}
                </h2>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setMonth(shiftMonth(visibleMonth, 1))}
                >
                  <Icon name="chevron-right" />
                  <span className="sr-only">Mes siguiente</span>
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  onClick={() => setMonth(thisMonth)}
                  disabled={visibleMonth === thisMonth && month !== 'all'}
                >
                  Hoy
                </button>
              </div>

              <MonthGrid month={visibleMonth} tournaments={gridItems} today={today} />

              <div className="agenda">
                <h3>Competiciones de {formatMonth(visibleMonth)}</h3>
                {agendaItems.length === 0 ? (
                  <p className="empty">No hay competiciones este mes.</p>
                ) : (
                  <div className="t-list">
                    {agendaItems.map((t) => (
                      <TournamentCard key={t.id} tournament={t} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {status === 'ready' && view === 'list' && (
            <section aria-label="Lista de competiciones">
              <p className="count" aria-live="polite">
                {listItems.length === 1 ? '1 competición' : `${listItems.length} competiciones`}
              </p>
              {listItems.length === 0 ? (
                <div className="empty">
                  <p>No hay competiciones que coincidan con los filtros.</p>
                  {filtersActive && (
                    <button type="button" className="btn btn--secondary btn--small" onClick={clearFilters}>
                      Quitar filtros
                    </button>
                  )}
                </div>
              ) : (
                grouped.map(([key, items]) => (
                  <div key={key} className="t-group">
                    <h2 className="t-group__title">{formatMonth(key)}</h2>
                    <div className="t-list">
                      {items.map((t) => (
                        <TournamentCard key={t.id} tournament={t} />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </section>
          )}

          <p className="source-note">
            El calendario se actualiza desde la fuente oficial; la participación de la UVa la registra el club. ¿Falta o
            sobra algún torneo? <Link to="/contacto">Escríbenos</Link>.
          </p>
        </div>
      </div>

      <TournamentDialog tournament={selected} onClose={closeDialog} />
    </>
  );
}
