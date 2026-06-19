import React, { useState, useEffect } from 'react';
import { X, ArrowRight, Check, Zap, Bike, Utensils, ShoppingBag } from 'lucide-react';
import { INDIAN_ESTIMATES, COST_PROXIES } from '../data/indianEstimates';

const CATEGORY_ICONS = {
  transport: Bike,
  energy: Zap,
  food: Utensils,
  consumption: ShoppingBag
};

const CATEGORY_LABELS = {
  transport: 'Transport',
  energy: 'Energy',
  food: 'Food',
  consumption: 'Shopping'
};

export default function QuickLogPanel({ isOpen, onClose, onSuccess, onOpenDetailed }) {
  const [todayLogs, setTodayLogs] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('transport');
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [isCostMode, setIsCostMode] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];

  // Fetch today's logs on open
  const fetchTodayLogs = async () => {
    try {
      const response = await fetch(`/api/activities?start_date=${todayStr}&end_date=${todayStr}&limit=100`);
      if (response.ok) {
        const data = await response.json();
        setTodayLogs(data.activities || []);
      }
    } catch (err) {
      console.error('Failed to fetch today\'s logs:', err);
    }
  };

  useEffect(() => {
    setTimeout(() => fetchTodayLogs(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isOpen) return null;

  // Presets for currently selected category
  const presets = INDIAN_ESTIMATES[selectedCategory] || [];

  const handleSelectPreset = (preset) => {
    setSelectedPreset(preset);
    setIsCostMode(false);
    setQuantity(preset.defaultQty.toString());
    setError('');
  };

  const handleQuickOptionClick = (val) => {
    setQuantity(val.toString());
  };

  const handleToggleMode = () => {
    if (!selectedPreset?.costProxy) return;
    const proxy = COST_PROXIES[selectedPreset.costProxy];
    const currentVal = parseFloat(quantity);
    if (!isNaN(currentVal) && currentVal > 0) {
      if (isCostMode) {
        // Toggling to unit mode: convert cost to units
        setQuantity(Math.round(proxy.toQty(currentVal)).toString());
      } else {
        // Toggling to cost mode: convert units to cost
        setQuantity(Math.round(proxy.fromQty(currentVal)).toString());
      }
    } else {
      setQuantity('');
    }
    setIsCostMode(!isCostMode);
  };

  const handleLogSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPreset) return;

    const numVal = parseFloat(quantity);
    if (isNaN(numVal) || numVal <= 0) {
      setError('Please enter a valid quantity.');
      return;
    }

    let finalQty = numVal;
    if (isCostMode && selectedPreset.costProxy) {
      const proxy = COST_PROXIES[selectedPreset.costProxy];
      finalQty = parseFloat(proxy.toQty(numVal).toFixed(2));
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedCategory,
          sub_type: selectedPreset.sub_type,
          quantity: finalQty,
          activity_date: todayStr
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to log activity');
      }

      onSuccess(data);
      fetchTodayLogs();
      setSelectedPreset(null);
      setQuantity('');
      setIsCostMode(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick option pills based on preset & mode
  const getQuickOptions = () => {
    if (!selectedPreset) return [];
    if (selectedPreset.sub_type === 'lpg_cylinder') {
      return [1, 2];
    }
    if (selectedCategory === 'food') {
      return [1, 2, 3];
    }
    if (isCostMode) {
      if (selectedPreset.costProxy === 'petrol' || selectedPreset.costProxy === 'petrol_bike') {
        return [200, 500, 1000, 2000];
      }
      if (selectedPreset.costProxy === 'electricity') {
        return [500, 1000, 2000, 5000];
      }
      return [100, 500, 1000];
    } else {
      if (selectedPreset.unit === 'km') {
        return [5, 10, 20, 50];
      }
      if (selectedPreset.unit === 'kWh') {
        return [5, 10, 50, 100];
      }
      if (selectedPreset.unit === 'kg') {
        return [1, 5, 10, 20];
      }
      return [1, 2, 5];
    }
  };

  const todayTotal = todayLogs.reduce((acc, log) => acc + log.co2e_kg, 0);

  return (
    <div className="drawer-overlay" onClick={onClose} role="none">
      <div 
        className="drawer" 
        onClick={(e) => e.stopPropagation()} 
        role="dialog" 
        aria-modal="true"
        aria-labelledby="quick-log-title"
        style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
      >
        <button 
          type="button" 
          onClick={onClose} 
          style={{ position: 'absolute', top: '20px', right: '20px', color: 'var(--color-ink-muted)' }}
          aria-label="Close Quick Log panel"
        >
          <X size={20} />
        </button>

        <h2 id="quick-log-title" style={{ color: 'var(--color-primary)' }}>Quick Log Presets</h2>

        {/* 1. Today's Summary */}
        <div style={{
          backgroundColor: 'var(--color-bg)',
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-ink)' }}>Today's Logs</span>
            <span style={{ 
              fontSize: '12px', 
              fontWeight: '700', 
              color: todayTotal > 0 ? 'var(--color-caution)' : 'var(--color-positive)',
              backgroundColor: todayTotal > 0 ? 'var(--color-caution-light)' : 'var(--color-positive-light)',
              padding: '2px 8px',
              borderRadius: '10px'
            }}>
              {todayTotal.toFixed(1)} kg CO2e
            </span>
          </div>
          {todayLogs.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)' }}>No activities logged today yet.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '80px', overflowY: 'auto' }}>
              {todayLogs.map(log => {
                const Icon = CATEGORY_ICONS[log.category] || Bike;
                return (
                  <span key={log.id} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-ink)'
                  }}>
                    <Icon size={12} style={{ color: 'var(--color-primary)' }} />
                    {log.quantity} {log.unit} ({log.co2e_kg.toFixed(1)} kg)
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Category Tabs */}
        <div style={{ 
          display: 'flex', 
          borderBottom: '1px solid var(--color-border)',
          gap: '8px'
        }}>
          {Object.keys(INDIAN_ESTIMATES).map(cat => {
            const Icon = CATEGORY_ICONS[cat];
            const isSel = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat);
                  setSelectedPreset(null);
                  setError('');
                }}
                style={{
                  flex: 1,
                  padding: '10px 4px',
                  fontSize: '13px',
                  fontWeight: isSel ? '700' : '500',
                  color: isSel ? 'var(--color-primary)' : 'var(--color-ink-muted)',
                  borderBottom: isSel ? '3px solid var(--color-primary)' : '3px solid transparent',
                  borderRadius: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Icon size={16} />
                {CATEGORY_LABELS[cat]}
              </button>
            );
          })}
        </div>

        {/* 3. Preset Grid */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
            paddingBottom: '20px'
          }}>
            {presets.map(preset => {
              const isSel = selectedPreset?.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    border: isSel ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    backgroundColor: isSel ? 'var(--color-primary-light)' : 'var(--color-surface)',
                    textAlign: 'left',
                    height: '84px',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-ink)' }}>{preset.label}</span>
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-ink-muted)' }}>
                      default: {preset.defaultQty} {preset.unit}
                    </span>
                    {isSel && <Check size={14} style={{ color: 'var(--color-primary)' }} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Quantity Picker Section */}
        {selectedPreset && (
          <form onSubmit={handleLogSubmit} className="animate-fade-in" style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {error && (
              <span style={{ fontSize: '13px', color: 'var(--color-caution)' }}>{error}</span>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="quick-qty-input" style={{ fontWeight: '600' }}>
                Enter {isCostMode ? 'Cost' : 'Quantity'}
              </label>
              
              {selectedPreset.costProxy && (
                <button
                  type="button"
                  onClick={handleToggleMode}
                  className="btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                >
                  Switch to {isCostMode ? selectedPreset.unit : '₹'}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  id="quick-qty-input"
                  type="number"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  style={{ width: '100%', paddingRight: '40px' }}
                  required
                />
                <span style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'var(--color-ink-muted)'
                }}>
                  {isCostMode ? '₹' : selectedPreset.unit}
                </span>
              </div>
            </div>

            {/* Quick Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {getQuickOptions().map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleQuickOptionClick(opt)}
                  className="btn-secondary"
                  style={{
                    padding: '6px 12px',
                    fontSize: '13px',
                    borderRadius: '16px',
                    backgroundColor: quantity === opt.toString() ? 'var(--color-primary)' : '',
                    color: quantity === opt.toString() ? 'var(--color-surface)' : ''
                  }}
                >
                  {isCostMode ? `₹${opt}` : `${opt} ${selectedPreset.unit}`}
                </button>
              ))}
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={isSubmitting}>
              {isSubmitting ? 'Logging...' : 'Log Activity'}
            </button>
          </form>
        )}

        {/* 5. Advanced Toggle */}
        <div style={{
          borderTop: '1px solid var(--color-border)',
          paddingTop: '16px',
          display: 'flex',
          justifyContent: 'center'
        }}>
          <button
            type="button"
            className="btn-text"
            onClick={() => {
              onClose();
              onOpenDetailed();
            }}
            style={{ fontSize: '14px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            Advanced Logging Form <ArrowRight size={14} />
          </button>
        </div>

      </div>
    </div>
  );
}
