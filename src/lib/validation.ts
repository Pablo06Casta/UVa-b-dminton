export interface ContactValues {
  nombre: string;
  apellidos: string;
  email: string;
  mensaje: string;
  privacidad: boolean;
}

export type ContactErrors = Partial<Record<keyof ContactValues, string>>;

// Comprobación práctica de formato: algo@dominio.tld, sin espacios.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export const isValidEmail = (value: string): boolean => EMAIL_RE.test(value.trim());

export function validateContact(values: ContactValues, maxMessage = 2000): ContactErrors {
  const errors: ContactErrors = {};
  if (!values.nombre.trim()) errors.nombre = 'Escribe tu nombre.';
  if (!values.apellidos.trim()) errors.apellidos = 'Escribe tus apellidos.';
  if (!values.email.trim()) errors.email = 'Escribe tu correo electrónico.';
  else if (!isValidEmail(values.email)) errors.email = 'El correo no tiene un formato válido (por ejemplo, nombre@dominio.es).';
  if (!values.mensaje.trim()) errors.mensaje = 'Escribe tu petición o mensaje.';
  else if (values.mensaje.length > maxMessage) errors.mensaje = `El mensaje no puede superar los ${maxMessage} caracteres.`;
  if (!values.privacidad) errors.privacidad = 'Debes aceptar la política de privacidad para enviar el mensaje.';
  return errors;
}
