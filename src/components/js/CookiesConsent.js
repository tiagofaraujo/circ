import React, { useState, useEffect } from 'react';
import '../css/CookiesConsent.css';

function CookiesConsent() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const consent = localStorage.getItem('cookies-consent');
        if (!consent) {
            setIsVisible(true);
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem('cookies-consent', 'accepted');
        setIsVisible(false);
    };

    const handleReject = () => {
        localStorage.setItem('cookies-consent', 'rejected');
        setIsVisible(false);
    };

    if (!isVisible) {
        return null;
    }

    return (
        <div className="cookies-consent">
            <p>Este site utiliza cookies para melhorar a experiência do usuário. Ao continuar navegando, você concorda com o uso de cookies.</p>
            <div className="cookies-consent-buttons">
                <button className="accept" onClick={handleAccept}>Aceitar</button>
                <button className="reject" onClick={handleReject}>Rejeitar</button>
            </div>
        </div>
    );
}

export default CookiesConsent;