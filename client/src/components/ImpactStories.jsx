import React, { useState, useEffect } from 'react';

export default function ImpactStories({ totalCO2e }) {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  const stories = [
    {
      title: 'Delhi Metro Journeys',
      text: `Your emissions are equivalent to riding the Delhi Metro for ${Math.round(totalCO2e / 0.015).toLocaleString()} km.`
    },
    {
      title: 'LPG Cylinders',
      text: `Your footprint equals the combustion of ${(totalCO2e / 42.3).toFixed(1)} standard 14.2 kg LPG cooking cylinders.`
    },
    {
      title: 'Banyan Trees Absorption',
      text: `It would take ${(totalCO2e / 20).toFixed(1)} mature Banyan trees a full year to absorb this amount of carbon.`
    },
    {
      title: 'EV Scooter Charges',
      text: `Your emissions equal charging a standard electric two-wheeler ${Math.round(totalCO2e / 2.1).toLocaleString()} times.`
    },
    {
      title: 'Indian Citizen Average',
      text: `This footprint matches ${(totalCO2e / 5.6).toFixed(1)} days of average emissions for a citizen of India.`
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % stories.length);
        setFade(true);
      }, 300); // Wait for fade out animation
    }, 5000);

    return () => clearInterval(timer);
  }, [stories.length]);

  if (totalCO2e <= 0) {
    return (
      <div style={{ fontSize: '13px', color: 'var(--color-ink-muted)' }}>
        No footprint logged yet. Start logging to see your carbon impact stories!
      </div>
    );
  }

  const currentStory = stories[index];

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '6px',
      transition: 'opacity 0.3s ease',
      opacity: fade ? 1 : 0,
      minHeight: '72px'
    }}>
      <span style={{ 
        fontSize: '11px', 
        textTransform: 'uppercase', 
        letterSpacing: '0.05em', 
        color: 'var(--color-primary)', 
        fontWeight: '700' 
      }}>
        Impact Context: {currentStory.title}
      </span>
      <p style={{ 
        fontSize: '13px', 
        color: 'var(--color-ink)', 
        lineHeight: '1.4',
        margin: 0
      }}>
        {currentStory.text}
      </p>
    </div>
  );
}
