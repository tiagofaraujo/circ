// src/components/js/Prices.js
import React from 'react';
import '../css/Prices.css';

function Prices() {
    return (
        <section className="prices">
            <h3>Taxas de Inscrição</h3>
            <ul>
                <li>Congressistas ULS Coimbra: €40</li>
                <li>Congressistas Externos: €80</li>
                <li>Estudantes IMR: €60</li>
            </ul>
        </section>
    );
}

export default Prices;
