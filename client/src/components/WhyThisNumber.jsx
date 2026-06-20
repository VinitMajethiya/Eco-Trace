import React, { useState, useEffect, useRef } from 'react';
import { Info, X } from 'lucide-react';
import { apiFetch } from '../lib/apiClient';

// Module-level factors cache
let cachedFactors = null;
let factorsFetchPromise = null;

async function getFactors() {
  if (cachedFactors) return cachedFactors;
  if (factorsFetchPromise) return factorsFetchPromise;
  factorsFetchPromise = apiFetch('/api/reference/emission-factors')
    .then(res => res.json())
    .then(data => {
      cachedFactors = data;
      return data;
    })
    .catch(() => null);
  return factorsFetchPromise;
}

export default function WhyThisNumber({ category, subType, quantity, co2e }) {
  const [isOpen, setIsOpen] = useState(false);
  const [factors, setFactors] = useState(cachedFactors);
  const [loading, setLoading] = useState(!cachedFactors && isOpen);

  const triggerRef = useRef(null);
  const closeBtnRef = useRef(null);
  const okBtnRef = useRef(null);

  useEffect(() => {
    const triggerEl = triggerRef.current;
    if (isOpen) {
      // Auto-focus close button
      const focusTimeout = setTimeout(() => {
        if (closeBtnRef.current) {
          closeBtnRef.current.focus();
        }
      }, 50);

      // Focus trap and ESC key handler
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          setIsOpen(false);
        } else if (e.key === 'Tab') {
          const focusable = [closeBtnRef.current, okBtnRef.current].filter(Boolean);
          if (focusable.length < 2) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first) {
              last.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === last) {
              first.focus();
              e.preventDefault();
            }
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      
      return () => {
        clearTimeout(focusTimeout);
        document.removeEventListener('keydown', handleKeyDown);
        // Restore focus to the trigger button when modal closes
        if (triggerEl) {
          triggerEl.focus();
        }
      };
    }
  }, [isOpen]);

  const toggleModal = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && !factors) {
      setLoading(true);
      getFactors().then(data => {
        if (data) setFactors(data);
        setLoading(false);
      });
    }
  };

  // Get details for current factor
  const factorInfo = factors?.[category]?.[subType];

  return (
    <>
      <button 
        ref={triggerRef}
        type="button"
        className="tooltip-trigger" 
        onClick={toggleModal}
        aria-label="Explain how this carbon footprint was calculated"
        title="Why this number?"
      >
        <Info size={14} />
      </button>

      {isOpen && (
        <div className="drawer-overlay" style={{ justifyContent: 'center', alignItems: 'center' }} onClick={toggleModal}>
          <div 
            className="card animate-slide-up" 
            style={{ 
              maxWidth: '500px', 
              width: '90%', 
              position: 'relative', 
              padding: '24px',
              boxShadow: 'var(--shadow-lg)',
              backgroundColor: 'var(--color-surface)'
            }} 
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button 
              ref={closeBtnRef}
              onClick={toggleModal} 
              style={{ position: 'absolute', top: '16px', right: '16px', color: 'var(--color-ink-muted)' }}
              aria-label="Close explanation"
            >
              <X size={20} />
            </button>

            <h3 id="modal-title" style={{ marginBottom: '16px', color: 'var(--color-primary)' }}>
              Calculation Transparency
            </h3>

            {loading ? (
              <p>Loading emission factors...</p>
            ) : factorInfo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '15px' }}>
                  This activity generates <strong>{co2e.toFixed(1)} kg CO2e</strong> based on a deterministic, standard formula:
                </p>

                <div style={{
                  backgroundColor: 'var(--color-bg)',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-ink)'
                }}>
                  Emissions = Quantity × Factor <br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= {quantity} {factorInfo.unit} × {factorInfo.factor}
                </div>

                <div style={{ fontSize: '14px', marginTop: '8px' }}>
                  <strong style={{ display: 'block', marginBottom: '4px' }}>Emission Factor Used:</strong>
                  <span>{factorInfo.factor} kg CO2e per {factorInfo.unit}</span>
                </div>

                <div style={{ fontSize: '14px' }}>
                  <strong style={{ display: 'block', marginBottom: '4px' }}>Source / Methodology:</strong>
                  <span style={{ color: 'var(--color-ink-muted)' }}>{factorInfo.source}</span>
                </div>

                <div style={{ 
                  marginTop: '12px', 
                  padding: '10px', 
                  borderRadius: 'var(--radius-sm)', 
                  backgroundColor: 'var(--color-primary-light)',
                  borderLeft: '4px solid var(--color-primary)',
                  fontSize: '13px',
                  color: 'var(--color-primary-hover)'
                }}>
                  <strong>Assumption Notice:</strong> This is a population average estimate. It serves as a behavioral awareness and coaching metric rather than an audited scientific lab measurement.
                </div>
              </div>
            ) : (
              <p>Could not load calculation details for category '{category}' sub-type '{subType}'.</p>
            )}

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button ref={okBtnRef} className="btn-primary" onClick={toggleModal}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
