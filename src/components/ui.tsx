import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

export function SectionHeading({
  eyebrow,
  title,
  lead,
  id,
  light = false,
  sport = false,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  id: string;
  light?: boolean;
  /** Estética deportiva (torneos, partidos, directo). */
  sport?: boolean;
}) {
  return (
    <header className={`section-heading${light ? ' section-heading--light' : ''}${sport ? ' section-heading--sport' : ''}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      {lead && <p className="lead">{lead}</p>}
    </header>
  );
}

export function PageHeader({ title, lead, sport = false }: { title: string; lead: string; sport?: boolean }) {
  return (
    <section className={`page-header${sport ? ' page-header--sport' : ''}`} aria-labelledby="page-title">
      <div className="container">
        <p className="eyebrow">Club Bádminton · Universidad de Valladolid</p>
        <h1 id="page-title">{title}</h1>
        <p className="lead">{lead}</p>
      </div>
    </section>
  );
}

/** Marca de contenido de ejemplo o pendiente de facilitar. */
export function PendingTag({ children = 'Provisional' }: { children?: ReactNode }) {
  return <span className="pending-tag">{children}</span>;
}

type ButtonProps = {
  to: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'light' | 'outline-light';
  arrow?: boolean;
};

export function ButtonLink({ to, children, variant = 'primary', arrow = false }: ButtonProps) {
  return (
    <Link to={to} className={`btn btn--${variant}`}>
      {children}
      {arrow && <Icon name="arrow-right" size={18} />}
    </Link>
  );
}

export function Notice({
  kind = 'info',
  title,
  children,
}: {
  kind?: 'info' | 'warning';
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={`notice notice--${kind}`} role="note">
      <Icon name={kind === 'warning' ? 'alert' : 'info'} size={22} />
      <div>
        <p className="notice__title">{title}</p>
        <p>{children}</p>
      </div>
    </div>
  );
}
