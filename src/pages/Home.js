// src/pages/Home.js
import React from 'react';
import RollerText from '../components/js/RollerText';
import HeroSection from '../components/js/HeroSection';
import About from '../components/js/About';
import TimeLine from '../components/js/TimeLine';
import Speakers from '../components/js/Speakers';
import Prices from '../components/js/Prices';
import '../App.css';
import '../index.css';

const Home = () => {
  return (
    <div className="Home">
{/*       <RollerText /> */}
      <HeroSection />
      <About />
      <TimeLine />
      <Speakers />
      <Prices />
    </div>
  );
};

export default Home;