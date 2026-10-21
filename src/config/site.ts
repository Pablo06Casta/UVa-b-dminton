import clubJson from '../data/club.json';
import type { ClubInfo } from '../types';

export const club = clubJson as ClubInfo;

export const nav = [
  { to: '/', label: 'Inicio' },
  { to: '/directo', label: 'Directo' },
  { to: '/calendario', label: 'Calendario' },
  { to: '/historia', label: 'Historia' },
  { to: '/contacto', label: 'Contacto' },
] as const;

/**
 * Configuración del formulario de contacto.
 *
 * Por defecto el mensaje llega por correo a través de FormSubmit (formsubmit.co) al correo del responsable de la web.
 * Para usar otro servicio o destinatario, define VITE_CONTACT_ENDPOINT (ver .env.example). Si el valor fuese vacío
 * la web validaría el formulario pero NO simularía ningún envío.
 */
export const contactForm = {
  endpoint: (import.meta.env.VITE_CONTACT_ENDPOINT as string | undefined)?.trim() || 'https://formsubmit.co/ajax/pablitocastaneda06@gmail.com',
  /** Segundos mínimos entre que se carga el formulario y se acepta un envío (antispam básico). */
  minFillSeconds: 3,
  maxMessageLength: 2000,
};

export const isContactFormConfigured = contactForm.endpoint.length > 0;
