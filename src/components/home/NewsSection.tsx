import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import newsJson from '../../data/news.json';
import { useLiveNews } from '../../hooks/useLiveNews';
import { formatDateRange } from '../../lib/dates';
import type { NewsItem } from '../../types';
import { Icon } from '../Icon';
import { SectionHeading } from '../ui';

const manual = newsJson as NewsItem[];
const MEDAL = { 1: 'Oro', 2: 'Plata', 3: 'Bronce' } as const;
const CLASS = { 1: 'gold', 2: 'silver', 3: 'bronze' } as const;

function Story({ item }: { item: NewsItem }) {
  const medals = [...(item.medals ?? [])].sort((a, b) => a.place - b.place);
  return (
    <article className="nfeat" aria-labelledby={`n-${item.id}`}>
      <p className="nfeat__meta">
        <span className="ntag">{item.tag}</span>
        <time dateTime={item.date}>{formatDateRange(item.date)}</time>
        {item.tournament?.place && (
          <span className="nfeat__where">
            <Icon name="pin" size={14} />
            {item.tournament.place}
          </span>
        )}
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
      {item.highlights && item.highlights.length > 0 && (
        <ul className="nhigh">
          {item.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {item.sources && item.sources.length > 0 && (
        <p className="nfeat__links">
          {item.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
              {s.label}
              <Icon name="external" size={14} />
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          ))}
        </p>
      )}
    </article>
  );
}

/** Noticias del club, justo debajo de la portada, en un carrusel que se desliza horizontalmente (la más reciente primero). */
export function NewsSection() {
  const track = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const auto = useLiveNews();
  // Las noticias escritas a mano mandan: si hay una del mismo torneo, no se repite la automática. La más reciente va primero.
  const news = useMemo(() => {
    const written = new Set(manual.map((n) => n.tournamentGuid).filter(Boolean));
    return [...manual, ...auto.filter((n) => !n.tournamentGuid || !written.has(n.tournamentGuid))].sort((a, b) => b.date.localeCompare(a.date));
  }, [auto]);

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const slides = Array.from(el.children) as HTMLElement[];
    let best = 0;
    slides.forEach((s, i) => {
      if (Math.abs(s.offsetLeft - el.scrollLeft) < Math.abs(slides[best].offsetLeft - el.scrollLeft)) best = i;
    });
    setIndex(best);
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [update, news.length]);

  if (news.length === 0) return null;

  const go = (i: number) => {
    const el = track.current;
    const slide = el?.children[Math.max(0, Math.min(news.length - 1, i))] as HTMLElement | undefined;
    if (el && slide) el.scrollTo({ left: slide.offsetLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <section id="noticias" className="section news" aria-labelledby="noticias-title">
      <div className="container">
        <div className="news__head">
          <SectionHeading sport light id="noticias-title" eyebrow="Última hora" title="Noticias" />
          {news.length > 1 && (
            <div className="ncontrols">
              <span className="ncontrols__count" aria-live="polite">
                {index + 1} / {news.length}
              </span>
              <button type="button" className="ncontrols__btn" onClick={() => go(index - 1)} disabled={index === 0}>
                <Icon name="chevron-left" size={22} />
                <span className="sr-only">Noticia anterior</span>
              </button>
              <button type="button" className="ncontrols__btn" onClick={() => go(index + 1)} disabled={index === news.length - 1}>
                <Icon name="chevron-right" size={22} />
                <span className="sr-only">Noticia siguiente</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="ncar" role="region" aria-roledescription="carrusel" aria-label="Noticias del club">
        <ul className="ncar__track" ref={track} tabIndex={0}>
          {news.map((n) => (
            <li key={n.id} className="ncar__slide">
              <Story item={n} />
            </li>
          ))}
        </ul>
        {news.length > 1 && (
          <div className="ncar__dots">
            {news.map((n, i) => (
              <button key={n.id} type="button" className={i === index ? 'is-active' : ''} aria-current={i === index} onClick={() => go(i)}>
                <span className="sr-only">Ir a la noticia {i + 1}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
