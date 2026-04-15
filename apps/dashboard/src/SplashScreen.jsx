import React, { useEffect, useState } from 'react';

const SplashScreen = ({ onFinished }) => {
    const [fadeOut, setFadeOut] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setFadeOut(true);
            setTimeout(onFinished, 500); // Wait for fade out animation
        }, 2000);

        return () => clearTimeout(timer);
    }, [onFinished]);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: '#111',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            opacity: fadeOut ? 0 : 1,
            transition: 'opacity 0.5s ease-in-out',
        }}>
            <div style={{
                textAlign: 'center',
                animation: 'pulse 2s infinite ease-in-out'
            }}>
                <img
                    src="/logo-ag.png"
                    alt="AG Logo"
                    style={{
                        width: '150px',
                        height: 'auto',
                        filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.2))'
                    }}
                />
                <style>
                    {`
            @keyframes pulse {
              0% { transform: scale(0.95); opacity: 0.8; }
              50% { transform: scale(1.05); opacity: 1; }
              100% { transform: scale(0.95); opacity: 0.8; }
            }
          `}
                </style>
            </div>
        </div>
    );
};

export default SplashScreen;
