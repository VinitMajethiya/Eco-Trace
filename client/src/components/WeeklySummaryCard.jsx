import React, { useState, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { apiFetch } from '../lib/apiClient';

export default function WeeklySummaryCard() {
  const [summary, setSummary] = useState('');
  const [weekKey, setWeekKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(true); // default to dismissed to avoid flickering before load

  useEffect(() => {
    let active = true;
    
    const fetchSummary = async () => {
      try {
        const response = await apiFetch('/api/dashboard/weekly-summary');
        if (!response.ok) throw new Error('Failed to load weekly summary');
        const data = await response.json();
        
        if (active) {
          setSummary(data.summaryText);
          setWeekKey(data.weekStartDate);
          
          // Check if user dismissed this specific week's summary
          const isStoredDismissed = localStorage.getItem(`dismissed_weekly_summary_${data.weekStartDate}`);
          if (!isStoredDismissed) {
            setIsDismissed(false);
          }
        }
      } catch (err) {
        console.error('Failed to load weekly summary:', err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchSummary();

    return () => {
      active = false;
    };
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    if (weekKey) {
      try {
        localStorage.setItem(`dismissed_weekly_summary_${weekKey}`, 'true');
      } catch {
        // Ignore sandbox localStorage block
      }
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative', minHeight: '80px' }}>
        <div style={{ width: '40%', height: '16px', backgroundColor: 'var(--color-bg)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
        <div style={{ width: '100%', height: '12px', backgroundColor: 'var(--color-bg)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
        <div style={{ width: '90%', height: '12px', backgroundColor: 'var(--color-bg)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
      </div>
    );
  }

  if (isDismissed || !summary) return null;

  return (
    <div 
      className="card animate-slide-up" 
      style={{ 
        position: 'relative', 
        padding: '20px 24px', 
        backgroundColor: 'var(--color-primary-light)',
        borderLeft: '5px solid var(--color-primary)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}
    >
      <button 
        onClick={handleDismiss} 
        style={{ position: 'absolute', top: '16px', right: '16px', color: 'var(--color-primary-hover)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
        aria-label="Dismiss weekly summary"
      >
        <X size={18} />
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary-hover)' }}>
        <Sparkles size={20} className="animate-pulse" />
        <strong style={{ fontSize: '15px', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Weekly AI Coaching Summary</strong>
      </div>

      <p style={{ 
        fontSize: '15px', 
        lineHeight: '1.6', 
        color: 'var(--color-ink)', 
        margin: 0,
        paddingRight: '20px',
        fontWeight: '500'
      }}>
        "{summary}"
      </p>
    </div>
  );
}
