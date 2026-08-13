import React, { useRef, useState } from 'react';
import emailjs from 'emailjs-com';
import { useLanguage } from '../../context/LanguageContext';
import '../css/ContactForm.css';

const EMAILJS_SERVICE_ID = 'service_vv5ni14';
const EMAILJS_TEMPLATE_ID = 'template_6xuck4c';
const EMAILJS_PUBLIC_KEY = 'D1sIRz3f4UAqdPlCj';
const CIRC_EMAIL = 'circ.chuc@gmail.com';

function ContactForm() {
  const form = useRef();
  const [status, setStatus] = useState('idle');
  const [feedback, setFeedback] = useState('');
  const [technicalError, setTechnicalError] = useState('');
  const { language } = useLanguage();
  const en = language === 'en';

  const sendEmail = async (event) => {
    event.preventDefault();
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

      form.current.reset();
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
          ? 'Your message could not be sent. The email service rejected the request.'
          : 'Não foi possível enviar a mensagem. O serviço de email recusou o pedido.'
      );
      setTechnicalError(
        diagnostic || (en ? 'No error code was returned by the service.' : 'Erro sem código devolvido pelo serviço.')
      );
    }
  };

  return (
    <form ref={form} onSubmit={sendEmail} className="contact-form">
      <input type="hidden" name="to_email" value={CIRC_EMAIL} />
      <input
        type="text"
        name="name"
        placeholder={en ? 'Name' : 'Nome'}
        autoComplete="name"
        required
      />
      <input type="email" name="email" placeholder="Email" autoComplete="email" required />
      <input type="text" name="subject" placeholder={en ? 'Subject' : 'Assunto'} required />
      <textarea name="message" placeholder={en ? 'Message' : 'Mensagem'} required />

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
          role="status"
          aria-live="polite"
        >
          <p>{feedback}</p>
          {status === 'error' && technicalError && (
            <small className="contact-form__technical-error">
              {en ? 'Technical code' : 'Código técnico'}: {technicalError}
            </small>
          )}
        </div>
      )}
    </form>
  );
}

export default ContactForm;
