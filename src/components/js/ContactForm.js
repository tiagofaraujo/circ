import React, { useRef, useState } from 'react';
import emailjs from 'emailjs-com';
import '../css/ContactForm.css';

const EMAILJS_SERVICE_ID = 'service_vv5ni14';
const EMAILJS_TEMPLATE_ID = 'template_6xuck4c';
const EMAILJS_PUBLIC_KEY = 'D1sIRz3f4UAqdPlCj';
const CIRC_EMAIL = 'circ.chuc@gmail.com';

function ContactForm() {
  const form = useRef();
  const [status, setStatus] = useState('idle');
  const [feedback, setFeedback] = useState('');

  const sendEmail = async (event) => {
    event.preventDefault();
    setStatus('sending');
    setFeedback('A enviar a mensagem…');

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

      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams,
        EMAILJS_PUBLIC_KEY
      );

      form.current.reset();
      setStatus('success');
      setFeedback('Mensagem enviada com sucesso. Obrigado pelo seu contacto.');
    } catch (error) {
      console.error('Erro EmailJS:', error);
      setStatus('error');
      setFeedback(
        'Não foi possível enviar a mensagem. Por favor, tente novamente ou contacte a organização diretamente.'
      );
    }
  };

  return (
    <form ref={form} onSubmit={sendEmail} className="contact-form">
      <input type="hidden" name="to_email" value={CIRC_EMAIL} />
      <input type="text" name="name" placeholder="Nome" autoComplete="name" required />
      <input type="email" name="email" placeholder="Email" autoComplete="email" required />
      <input type="text" name="subject" placeholder="Assunto" required />
      <textarea name="message" placeholder="Mensagem" required />

      <div className="contact-form__actions">
        <button type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'A enviar…' : 'Enviar'}
        </button>
        <span className="contact-form__destination">Destino: {CIRC_EMAIL}</span>
      </div>

      {feedback && (
        <p
          className={`contact-form__feedback contact-form__feedback--${status}`}
          role="status"
          aria-live="polite"
        >
          {feedback}
        </p>
      )}
    </form>
  );
}

export default ContactForm;
