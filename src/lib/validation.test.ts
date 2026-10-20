import { describe, expect, it } from 'vitest';
import { isValidEmail, validateContact } from './validation';

const ok = { nombre: 'Ana', apellidos: 'García', email: 'ana@uva.es', mensaje: 'Hola', privacidad: true };

describe('isValidEmail', () => {
  it.each(['a@b.es', 'ana.garcia@alumnos.uva.es'])('acepta %s', (v) => expect(isValidEmail(v)).toBe(true));
  it.each(['', 'ana', 'ana@', '@uva.es', 'ana@uva', 'ana @uva.es', 'ana@uva..es'])('rechaza "%s"', (v) =>
    expect(isValidEmail(v)).toBe(false),
  );
});

describe('validateContact', () => {
  it('sin errores con datos válidos', () => expect(validateContact(ok)).toEqual({}));
  it('exige todos los campos y la privacidad', () => {
    const errors = validateContact({ nombre: ' ', apellidos: '', email: '', mensaje: '', privacidad: false });
    expect(Object.keys(errors).sort()).toEqual(['apellidos', 'email', 'mensaje', 'nombre', 'privacidad']);
  });
  it('limita la longitud del mensaje', () => {
    expect(validateContact({ ...ok, mensaje: 'x'.repeat(11) }, 10).mensaje).toMatch(/10 caracteres/);
  });
});
