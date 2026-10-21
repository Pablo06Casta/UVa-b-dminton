import newsJson from '../../data/news.json';
import { formatDateRange } from '../../lib/dates';
import type { NewsItem } from '../../types';
import { Icon } from '../Icon';
import { SectionHeading } from '../ui';

const news = (newsJson as NewsItem[]).slice().sort((a, b) => b.date.localeCompare(a.date));
const MEDAL = { 1: 'Oro', 2: 'Plata', 3: 'Bronce' } as const;
const CLASS = { 1: 'gold', 2: 'silver', 3: 'bronze' } as const;

function Tally({ medals }: { medals: NonNullable<NewsItem['medals']> }) {
  return (
    <ul className="tally" aria-label="Medallas conseguidas">
      {([1, 2, 3] as const).map((p) => (
        <li key={p} className={`tally__disc tally__disc--${CLASS[p]}`}>
          <span className="tally__n">{medals.filter((m) => m.place === p).length}</span>
          <span className="tally__label">{MEDAL[p]}</span>
        </li>
      ))}
    </ul>
  );
}

function Featured({ item }: { item: NewsItem }) {
  const medals = [...(item.medals ?? [])].sort((a, b) => a.place - b.place);
  return (
    <article className="nfeat" aria-labelledby={`n-${item.id}`}>
      <div className="nfeat__side">
        {medals.length > 0 && <Tally medals={medals} />}
        {item.tournament && (
          <p className="nfeat__where">
            <Icon name="pin" size={16} />
            {item.tournament.place}
          </p>
        )}
      </div>
      <div className="nfeat__main">
        <p className="nfeat__meta">
          <span className="ntag">{item.tag}</span>
          <time dateTime={item.date}>{formatDateRange(item.date)}</time>
        </p>
        <h3 id={`n-${item.id}`}>{item.title}</h3>
        <p className="nfeat__summary">{item.summary}</p>
        {medals.length > 0 && (
          <ul className="nmedals">
            {medals.map((m) => (
              <li key={`${m.event}-${m.who}-${m.place}`} className={`nmedal nmedal--${CLASS[m.place]}`}>
                <span className="nmedal__place">{MEDAL[m.place]}</span>
                <span className="nmedal__body">
                  <strong>{m.who}</strong>
                  <span className="nmedal__event"> · {m.eventName}</span>
                  {m.detail && <small>{m.detail}</small>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="nfeat__links">
          {item.tournament?.url && (
            <a href={item.tournament.url} target="_blank" rel="noopener noreferrer">
              {item.tournament.name}
              <Icon name="external" size={15} />
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          )}
          {item.source && (
            <a href={item.source.url} target="_blank" rel="noopener noreferrer">
              {item.source.label}
              <Icon name="external" size={15} />
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          )}
        </p>
      </div>
    </article>
  );
}

/** Noticias del club, justo debajo de la portada. La primera (más reciente) va destacada; el resto, en una lista. */
export function NewsSection() {
  if (news.length === 0) return null;
  const [first, ...rest] = news;
  return (
    <section id="noticias" className="section news" aria-labelledby="noticias-title">
      <div className="container">
        <SectionHeading sport light id="noticias-title" eyebrow="Última hora" title="Noticias" />
        <Featured item={first} />
        {rest.length > 0 && (
          <ul className="nlist">
            {rest.map((n) => (
              <li key={n.id}>
                <span className="ntag">{n.tag}</span>
                <time dateTime={n.date}>{formatDateRange(n.date)}</time>
                <strong>{n.title}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
