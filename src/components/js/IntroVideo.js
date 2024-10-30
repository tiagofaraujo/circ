import React, { useState, useRef } from 'react';
import '../css/IntroVideo.css';

function IntroVideo({ onSkip }) {
    const [isMuted, setIsMuted] = useState(true);
    const videoRef = useRef(null);

    const toggleMute = () => {
        setIsMuted(!isMuted);
        videoRef.current.muted = !isMuted;
    };

    return (
        <div className="intro-video-container">
            <video className="intro-video" autoPlay muted={isMuted} ref={videoRef}>
                <source src="/video/intro.mp4" type="video/mp4" />
                Seu navegador não suporta o elemento de vídeo.
            </video>
            <div className="intro-video-controls">
                <button className="mute-button" onClick={toggleMute}>
                    {isMuted ? '🔇' : '🔊'}
                </button>
                <button className="skip-button" onClick={onSkip}>
                    Skip Intro
                </button>
            </div>
        </div>
    );
}

export default IntroVideo;