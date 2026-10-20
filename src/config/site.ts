import clubJson from '../data/club.json';
import type { ClubInfo } from '../types';

export const club = clubJson as ClubInfo;

export const nav = [
  { to: '/', label: 'Inicio' },
  { to: '/historia', label: 'Historia' },
  { to: '/calendario', label: 'Calendario' },
  { to: '/contacto', label: 'Contacto' },
] as const;

/**
 * Configuración del formulario de contacto.
 *
 * El formulario solo se considera operativo cuando `endpoint` tiene valor. Mientras esté vacío,
 * la web valida el formulario pero NO simula ningún envío (ver docs/ESTADO.md).
 * Se configura con la variable de entorno VITE_CONTACT_ENDPOINT (ver .env.example).
 */
export const contactForm = {
  endpoint: (import.meta.env.VITE_CONTACT_ENDPOINT as string | undefined)?.trim() ?? '',
  /** Segundos mínimos entre que se carga el formulario y se acepta un envío (antispam básico). */
  minFillSeconds: 3,
  maxMessageLength: 2000,
};

export const isContactFormConfigured = contactForm.endpoint.length > 0;
