// src/App.js
import React from 'react';
import Navbar from './components/js/Navbar';
import Footer from './components/js/Footer';
import Home from './pages/Home';
import './App.css';
import './index.css';


function App() {
  return (
    <div className="App">
      <Navbar />
      <Home />
      <Footer />
    </div>
  );
}

export default App;

