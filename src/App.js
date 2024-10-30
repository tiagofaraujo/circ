import React, { useState, useEffect } from 'react';
import Navbar from './components/js/Navbar';
import Footer from './components/js/Footer';
import Home from './pages/Home';
import CookiesConsent from './components/js/CookiesConsent';
import IntroVideo from './components/js/IntroVideo';
import './App.css';
import './index.css';

function App() {
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowIntro(false);
    }, 22000); // Duração do vídeo em milissegundos (22 segundos)

    return () => clearTimeout(timer);
  }, []);

  const handleSkip = () => {
    setShowIntro(false);
  };

  return (
    <div className="App">
      {showIntro ? (
        <IntroVideo onSkip={handleSkip} />
      ) : (
        <>
          <Navbar />
          <Home />
          <Footer />
          <CookiesConsent />
        </>
      )}
    </div>
  );
}

export default App;