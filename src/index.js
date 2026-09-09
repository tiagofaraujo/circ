import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// CSS de bibliotecas primeiro. A identidade CIRC é carregada depois para ter prioridade
// sobre os estilos tipográficos por defeito do Bootstrap/MDB.
import 'bootstrap/dist/css/bootstrap.min.css';
import 'mdb-react-ui-kit/dist/css/mdb.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

import './index.css';
import './myCircBackground.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

reportWebVitals();

// Installation support; personal data is never precached by this service worker.
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/my-circ-sw.js', { updateViaCache: 'none' }).catch(() => {
      // The online website remains usable if the browser disallows installation.
    });
  });
}
