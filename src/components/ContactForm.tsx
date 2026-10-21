import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { contactForm, isContactFormConfigured } from '../config/site';
import { validateContact, type ContactErrors, type ContactValues } from '../lib/validation';
import { Icon } from './Icon';

type Status = 'idle' | 'sending' | 'sent' | 'error' | 'unconfigured';

const empty: ContactValues = { nombre: '', apellidos: '', email: '', mensaje: '', privacidad: false };

export function ContactForm() {
  const [values, setValues] = useState<ContactValues>(empty);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [errorText, setErrorText] = useState('');
  const sending = useRef(false); // evita envíos duplicados aunque se pulse dos veces seguidas
  const openedAt = useRef(Date.now());
  const honeypot = useRef<HTMLInputElement>(null);
  const summary = useRef<HTMLDivElement>(null);

  const update = <K extends keyof ContactValues>(key: K, value: ContactValues[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(validateContact(next, contactForm.maxMessageLength));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending.current) return;

    setSubmitted(true);
    const found = validateContact(values, contactForm.maxMessageLength);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setStatus('idle');
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }

    // Antispam básico: campo trampa invisible y tiempo mínimo de relleno.
    const tooFast = Date.now() - openedAt.current < contactForm.minFillSeconds * 1000;
    if (honeypot.current?.value || tooFast) {
      setErrorText('No se ha podido enviar el mensaje. Espera unos segundos y vuelve a intentarlo.');
      setStatus('error');
      return;
    }

    // Sin servicio configurado no se simula ningún envío.
    if (!isContactFormConfigured) {
      setStatus('unconfigured');
      return;
    }

    sending.current = true;
    setStatus('sending');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(contactForm.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          nombre: values.nombre.trim(),
          apellidos: values.apellidos.trim(),
          email: values.email.trim(),
          mensaje: values.mensaje.trim(),
          // Opciones de FormSubmit (el resto de servicios las ignoran): asunto, formato de tabla y sin página de captcha.
          _subject: `Web del club · mensaje de ${values.nombre.trim()} ${values.apellidos.trim()}`,
          _template: 'table',
          _captcha: 'false',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(String(res.status));
      // Algunos servicios responden 200 con `success: false` (p. ej. formulario sin activar): no es un envío correcto.
      const body = (await res.json().catch(() => ({}))) as { success?: unknown };
      if (body.success === false || body.success === 'false') throw new Error('rechazado');
      setValues(empty);
      setSubmitted(false);
      setErrors({});
      setStatus('sent');
    } catch {
      setErrorText('No se ha podido enviar el mensaje. Inténtalo de nuevo en unos minutos.');
      setStatus('error');
    } finally {
      sending.current = false;
    }
  }

  if (status === 'sent') {
    return (
      <div className="form-result form-result--ok" role="status">
        <Icon name="check" size={28} />
        <h2>Mensaje enviado</h2>
        <p>Gracias por escribirnos. El club responderá a tu correo en cuanto sea posible.</p>
        <button type="button" className="btn btn--secondary" onClick={() => { openedAt.current = Date.now(); setStatus('idle'); }}>
          Enviar otro mensaje
        </button>
      </div>
    );
  }

  const errorList = Object.entries(errors) as [keyof ContactValues, string][];
  const field = (name: keyof ContactValues) => ({
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  });
  const fieldError = (name: keyof ContactValues) =>
    errors[name] ? (
      <p id={`${name}-error`} className="field__error">
        {errors[name]}
      </p>
    ) : null;

  return (
    <form className="form" onSubmit={onSubmit} noValidate aria-busy={status === 'sending'}>
      {errorList.length > 0 && (
        <div ref={summary} className="form-summary" role="alert" tabIndex={-1}>
          <p>
            <strong>Revisa el formulario:</strong> hay {errorList.length === 1 ? 'un campo' : `${errorList.length} campos`} por
            corregir.
          </p>
          <ul>
            {errorList.map(([name, msg]) => (
              <li key={name}>
                <a
                  href={`#${name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(name)?.focus();
                  }}
                >
                  {msg}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="form__row">
        <div className="field">
          <label htmlFor="nombre">Nombre <span aria-hidden="true">*</span></label>
          <input id="nombre" name="nombre" type="text" autoComplete="given-name" required value={values.nombre}
            onChange={(e) => update('nombre', e.target.value)} {...field('nombre')} />
          {fieldError('nombre')}
        </div>
        <div className="field">
          <label htmlFor="apellidos">Apellidos <span aria-hidden="true">*</span></label>
          <input id="apellidos" name="apellidos" type="text" autoComplete="family-name" required value={values.apellidos}
            onChange={(e) => update('apellidos', e.target.value)} {...field('apellidos')} />
          {fieldError('apellidos')}
        </div>
      </div>

      <div className="field">
        <label htmlFor="email">Correo electrónico <span aria-hidden="true">*</span></label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required value={values.email}
          onChange={(e) => update('email', e.target.value)} {...field('email')} />
        {fieldError('email')}
      </div>

      <div className="field">
        <label htmlFor="mensaje">Petición o mensaje <span aria-hidden="true">*</span></label>
        <textarea id="mensaje" name="mensaje" rows={6} required maxLength={contactForm.maxMessageLength + 200}
          value={values.mensaje} onChange={(e) => update('mensaje', e.target.value)} {...field('mensaje')} />
        <p className="field__hint">{values.mensaje.length}/{contactForm.maxMessageLength} caracteres</p>
        {fieldError('mensaje')}
      </div>

      {/* Campo trampa antispam: invisible para personas, los bots suelen rellenarlo. */}
      <div className="hp" aria-hidden="true">
        <label>
          No rellenar este campo
          <input ref={honeypot} type="text" name="empresa" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="field field--check">
        <input id="privacidad" name="privacidad" type="checkbox" checked={values.privacidad}
          onChange={(e) => update('privacidad', e.target.checked)} {...field('privacidad')} />
        <label htmlFor="privacidad">
          He leído y acepto la <Link to="/legal#privacidad">política de privacidad</Link>. <span aria-hidden="true">*</span>
        </label>
        {fieldError('privacidad')}
      </div>

      <p className="field__hint">Los campos marcados con * son obligatorios.</p>

      <div aria-live="polite">
        {status === 'error' && (
          <p className="form-result form-result--error"><Icon name="alert" size={20} /> {errorText}</p>
        )}
        {status === 'unconfigured' && (
          <p className="form-result form-result--warn">
            <Icon name="alert" size={20} />
            <span>
              <strong>Tu mensaje NO se ha enviado.</strong> El envío de mensajes todavía no está configurado en esta web.
            </span>
          </p>
        )}
      </div>

      <button type="submit" className="btn btn--primary" disabled={status === 'sending'}>
        {status === 'sending' ? 'Enviando…' : 'Enviar mensaje'}
      </button>
    </form>
  );
}
