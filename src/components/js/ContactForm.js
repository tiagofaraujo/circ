import React, { useRef } from 'react';
import emailjs from 'emailjs-com';
import '../css/ContactForm.css';

function ContactForm() {
    const form = useRef();

    const sendEmail = (e) => {
        e.preventDefault();

        // Enviar o formulário usando EmailJS
        emailjs.sendForm('service_vv5ni14', 'template_6xuck4c', form.current, 'D1sIRz3f4UAqdPlCj')
            .then((result) => {
                console.log(result.text);
                alert('Mensagem enviada com sucesso!');
            }, (error) => {
                console.log(error.text);
                alert('Erro ao enviar a mensagem. Tente novamente.');
            });
    };

    return (
        <form ref={form} onSubmit={sendEmail} className="contact-form">
            <input type="text" name="name" placeholder="Nome" required />
            <input type="email" name="email" placeholder="Email" required />
            <input type="text" name="subject" placeholder="Assunto" required />
            <textarea name="message" placeholder="Mensagem" required></textarea>
            <button type="submit">Enviar</button>
        </form>
    );
}

export default ContactForm;
