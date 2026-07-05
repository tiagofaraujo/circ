import React, { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';

import Navbar from './components/js/Navbar';
import Footer from './components/js/Footer';
import CookiesConsent from './components/js/CookiesConsent';
import IntroVideo from './components/js/IntroVideo';

import Home from './pages/Home';

import './App.css';
import './index.css';

const PlaceholderPage = ({ title }) => {
  return (
    <main
      style={{
        minHeight: '70vh',
        padding: '140px 24px 80px',
        textAlign: 'center',
      }}
    >
      <h1>{title}</h1>
      <p>Conteúdo em atualização para o CIRC 2027.</p>
    </main>
  );
};

function App() {
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowIntro(false);
    }, 22000);

    return () => clearTimeout(timer);
  }, []);

  const handleSkip = () => {
    setShowIntro(false);
  };

  if (showIntro) {
    return <IntroVideo onSkip={handleSkip} />;
  }

  return (
    <div className="App">
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />

        <Route
          path="/exhibition"
          element={<PlaceholderPage title="Exposição Técnica" />}
        />

        <Route
          path="/schedule"
          element={<PlaceholderPage title="Programa" />}
        />

        <Route
          path="/sponsors"
          element={<PlaceholderPage title="Parcerias" />}
        />

        <Route
          path="/hotels"
          element={<PlaceholderPage title="Hotel e Restauração" />}
        />

        <Route
          path="/contact"
          element={<PlaceholderPage title="Contactos" />}
        />

        <Route
          path="*"
          element={<PlaceholderPage title="Página não encontrada" />}
        />
      </Routes>

      <Footer />
      <CookiesConsent />
    </div>
  );
}

export default App;
