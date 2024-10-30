import React, { useState, useEffect } from 'react';
import '../css/Footer.css';
import ContactForm from './ContactForm';
import '@fortawesome/fontawesome-free/css/all.min.css';

function Footer() {
    const [isVisible, setIsVisible] = useState(false);

    // Mostrar o botão de "Back to the Top" após rolar 300px
    const toggleVisibility = () => {
        if (window.pageYOffset > 300) {
            setIsVisible(true);
        } else {
            setIsVisible(false);
        }
    };

    // Rolar para o topo da página
    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth',
        });
    };

    useEffect(() => {
        window.addEventListener('scroll', toggleVisibility);
        return () => {
            window.removeEventListener('scroll', toggleVisibility);
        };
    }, []);

    return (
        <>
            <footer className="footer">
                <div className="footer-columns">
                    <div className="footer-column">
                        <h3>Sobre</h3>
                        <ul>
                            <li>Associação</li>
                            <li>CIRC2023</li>
                            <li>Política de Privacidade</li>
                            <li>Termos de Utilização</li>
                            <li>Política de Cookies</li>
                        </ul>
                    </div>

                    <div className="footer-column">
                        <h3>Comissões</h3>
                        <ul>
                            <li>Comissão Organizadora</li>
                            <li>Comissão Científica</li>
                            <li>Comissões Técnicas</li>
                        </ul>
                    </div>

                    <div className="footer-column">
                        <h3>Contacte-nos</h3>
                        <ContactForm />
                    </div>
                </div>
                <div className="footer-copyright">
                    <p>&copy; 2025 Congresso Internacional de Radiologia de Coimbra</p>
                </div>
            </footer>

            {/* Back to Top Section */}
            {isVisible && (
                <div className="back-to-top" onClick={scrollToTop}>
                    <i className="fas fa-chevron-up"></i>
                </div>
            )}
        </>
    );
}

export default Footer;