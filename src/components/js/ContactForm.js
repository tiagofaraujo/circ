import React, { useEffect, useRef, useState } from 'react';
import emailjs from 'emailjs-com';
import { useLanguage } from '../../context/LanguageContext';
import '../css/ContactForm.css';

const EMAILJS_SERVICE_ID = 'service_vv5ni14';
const EMAILJS_TEMPLATE_ID = 'template_6xuck4c';
const EMAILJS_PUBLIC_KEY = 'D1sIRz3f4UAqdPlCj';
const CIRC_EMAIL = 'circ.chuc@gmail.com';

function ContactForm() {
  const form = useRef();
  const sending = useRef(false);
  const feedbackRef = useRef(null);
  const [draft, setDraft] = useState({ name: '', email: '', subject: '', message: '' });
  const updateDraft = event => {
    const { name, value } = event.target;
    event.target.setCustomValidity('');
    setDraft(current => ({ ...current, [name]: value }));
  };
  const [status, setStatus] = useState('idle');
  const [feedback, setFeedback] = useState('');
  const [technicalError, setTechnicalError] = useState('');
  const { language } = useLanguage();
  const en = language === 'en';
  useEffect(() => { if (status === 'error' || status === 'success') feedbackRef.current?.focus(); }, [status]);
  const manualEmail = `mailto:${CIRC_EMAIL}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(`${draft.message}\n\n${draft.name}\n${draft.email}`)}`;

  const sendEmail = async (event) => {
    event.preventDefault();
    if (sending.current) return;
    for (const name of ['name', 'email', 'subject', 'message']) {
      const field = form.current.elements.namedItem(name);
      if (!field.value.trim()) {
        field.setCustomValidity(en ? 'Please complete this field.' : 'Preencha este campo.');
        field.reportValidity(); field.focus(); return;
      }
    }
    if (!form.current.reportValidity()) return;
    sending.current = true;
    setStatus('sending');
    setFeedback(en ? 'Sending your message…' : 'A enviar a mensagem…');
    setTechnicalError('');

    try {
      const formData = new FormData(form.current);
      const templateParams = {
        name: formData.get('name'),
        from_name: formData.get('name'),
        email: formData.get('email'),
        reply_to: formData.get('email'),
        subject: formData.get('subject'),
        message: formData.get('message'),
        to_email: CIRC_EMAIL,
        recipient: CIRC_EMAIL,
      };

      const response = await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams,
        EMAILJS_PUBLIC_KEY
      );

      if (response?.status !== 200) {
        throw response;
      }

      setDraft({ name: '', email: '', subject: '', message: '' });
      setStatus('success');
      setFeedback(
        en
          ? 'Message sent successfully. Thank you for contacting us.'
          : 'Mensagem enviada com sucesso. Obrigado pelo seu contacto.'
      );
    } catch (error) {
      console.error('EmailJS error:', error);

      const errorStatus = error?.status ? String(error.status) : '';
      const errorText = error?.text || error?.message || '';
      const diagnostic = [errorStatus, errorText].filter(Boolean).join(' · ');

      setStatus('error');
      setFeedback(
        en
          ? 'Your message could not be sent. Your text is still here. Try again or open it in your email app.'
          : 'Não foi possível enviar a mensagem. O texto foi mantido. Tente novamente ou abra a mensagem na sua aplicação de email.'
      );
      setTechnicalError(
        diagnostic || (en ? 'No error code was returned by the service.' : 'Erro sem código devolvido pelo serviço.')
      );
    } finally {
      sending.current = false;
    }
  };

  return (
    <form ref={form} onSubmit={sendEmail} className="contact-form" aria-busy={status === 'sending'}>
      <input type="hidden" name="to_email" value={CIRC_EMAIL} />
      <label className="contact-form__field" htmlFor="contact-name">
        <span>{en ? 'Name' : 'Nome'}</span>
        <input
          id="contact-name"
          type="text"
          name="name" value={draft.name} onChange={updateDraft} maxLength={150} disabled={status === 'sending'}
          placeholder={en ? 'Name' : 'Nome'}
          autoComplete="name"
          required
        />
      </label>
      <label className="contact-form__field" htmlFor="contact-email">
        <span>Email</span>
        <input id="contact-email" type="email" name="email" value={draft.email} onChange={updateDraft} maxLength={254} disabled={status === 'sending'} inputMode="email" autoCapitalize="none" spellCheck="false" placeholder="Email" autoComplete="email" required />
      </label>
      <label className="contact-form__field" htmlFor="contact-subject">
        <span>{en ? 'Subject' : 'Assunto'}</span>
        <input id="contact-subject" type="text" name="subject" value={draft.subject} onChange={updateDraft} maxLength={200} disabled={status === 'sending'} placeholder={en ? 'Subject' : 'Assunto'} required />
      </label>
      <label className="contact-form__field" htmlFor="contact-message">
        <span>{en ? 'Message' : 'Mensagem'}</span>
        <textarea id="contact-message" name="message" value={draft.message} onChange={updateDraft} maxLength={5000} disabled={status === 'sending'} placeholder={en ? 'Message' : 'Mensagem'} required />
      </label>

      <div className="contact-form__actions">
        <button type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? (en ? 'Sending…' : 'A enviar…') : (en ? 'Send' : 'Enviar')}
        </button>
        <span className="contact-form__destination">
          {en ? 'To' : 'Destino'}: {CIRC_EMAIL}
        </span>
      </div>

      {feedback && (
        <div
          className={`contact-form__feedback contact-form__feedback--${status}`}
          ref={feedbackRef} tabIndex="-1" role="status"
          aria-live="polite"
        >
          <p>{feedback}</p>
          {status === 'error' && <>
            <a className="contact-form__fallback" href={manualEmail}>{en ? 'Open in my email app' : 'Abrir na minha aplicação de email'}</a>
            <p>{en ? 'You can also email us at' : 'Também pode escrever para'} <a href={`mailto:${CIRC_EMAIL}`}>{CIRC_EMAIL}</a>.</p>
            {technicalError && <details><summary>{en ? 'Technical details' : 'Detalhes técnicos'}</summary><small className="contact-form__technical-error">{technicalError}</small></details>}
          </>}
        </div>
      )}
    </form>
  );
}

export default ContactForm;
