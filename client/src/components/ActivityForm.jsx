import React, { useState, useEffect, useRef } from 'react';
import { X, Bike, Zap, Utensils, ShoppingBag, ArrowLeft, ArrowRight, Save } from 'lucide-react';
import { apiFetch } from '../lib/apiClient';

// Module-level cache: fetched once per browser session from the server
// This ensures the live preview always matches the server calculation
let cachedFactors = null;
let factorsFetchPromise = null;

async function getFactors() {
  if (cachedFactors) return cachedFactors;
  if (factorsFetchPromise) return factorsFetchPromise;
  factorsFetchPromise = apiFetch('/api/reference/emission-factors')
    .then(res => {
      if (!res.ok) throw new Error('Failed to retrieve factors');
      return res.json();
    })
    .then(data => {
      cachedFactors = data;
      return data;
    })
    .catch(err => {
      factorsFetchPromise = null;
      throw err;
    });
  return factorsFetchPromise;
}

// Display labels for sub-types (client-side only, not in server factors JSON)
const SUB_TYPE_LABELS = {
  transport: {
    car_petrol: 'Petrol Car', car_diesel: 'Diesel Car', two_wheeler: 'Motorcycle/Scooter',
    bus: 'Local Bus', train: 'Train Journey', flight_domestic: 'Domestic Flight', bicycle_walk: 'Bicycle / Walk',
    cng_car: 'CNG Car', auto_rickshaw: 'Auto-rickshaw', cab: 'Cab / Taxi',
    commute_bike_petrol: 'Bike / Scooter (Petrol)', commute_car_petrol: 'Car (Petrol)',
    commute_auto: 'Auto-rickshaw', commute_metro: 'Metro / Local Train', commute_bus: 'City Bus',
    commute_cng_car: 'Car (CNG)', commute_cab: 'Cab / Taxi'
  },
  energy: {
    electricity_grid: 'Grid Electricity', lpg_cooking: 'LPG Cooking Gas',
    electricity_home: 'Home Electricity', lpg_cylinder: 'LPG Cylinder Refill'
  },
  food: {
    beef_meal: 'Beef Meal', chicken_meal: 'Chicken Meal', vegetarian_meal: 'Vegetarian Meal', vegan_meal: 'Vegan Meal',
    meal_veg: 'Veg Meal', meal_egg: 'Eggs / Dairy Meal', meal_chicken: 'Chicken Meal', meal_beef_mutton: 'Mutton/Beef Meal'
  },
  consumption: {
    fast_fashion_item: 'Fast Fashion Item', electronics_item: 'Device / Electronics',
    general_waste_kg: 'Landfill Waste', online_shopping: 'Online Order', general_waste: 'Household Waste'
  }
};

export default function ActivityForm({ isOpen, onClose, onSuccess, initialDefaults = {} }) {
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState('');
  const [subType, setSubType] = useState('');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [factors, setFactors] = useState(cachedFactors);
  const [isLoadingFactors, setIsLoadingFactors] = useState(!cachedFactors);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringType, setRecurringType] = useState('daily'); // 'daily', 'weekdays', 'weekends', 'custom'
  const [selectedDays, setSelectedDays] = useState({
    0: false, 1: false, 2: false, 3: false, 4: false, 5: false, 6: false
  });

  const firstBtnRef = useRef(null);
  const subTypeSelectRef = useRef(null);
  const quantityInputRef = useRef(null);

  // Fetch factors once per session if not yet cached on mount
  useEffect(() => {
    if (!cachedFactors) {
      getFactors()
        .then(f => {
          if (f && typeof f === 'object' && ('transport' in f || 'energy' in f)) {
            setFactors(f);
          } else {
            setError('Failed to load emission factors reference data.');
          }
          setIsLoadingFactors(false);
        })
        .catch(() => {
          setError('Failed to load emission factors reference data.');
          setIsLoadingFactors(false);
        });
    }
  }, []);

  // Handle focusing the first button on step 1 open
  useEffect(() => {
    if (isOpen && step === 1 && firstBtnRef.current) {
      firstBtnRef.current.focus();
    }
  }, [isOpen, step]);

  // Auto-focus appropriate inputs on subsequent steps
  useEffect(() => {
    if (step === 2 && subTypeSelectRef.current) {
      subTypeSelectRef.current.focus();
    } else if (step === 3 && quantityInputRef.current) {
      quantityInputRef.current.focus();
    }
  }, [step]);

  if (!isOpen) return null;

  if (isLoadingFactors) {
    return (
      <div className="drawer-overlay" onClick={onClose} role="none">
        <div className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="drawer-title">
          <button type="button" onClick={onClose} style={{ position: 'absolute', top: '20px', right: '20px', color: 'var(--color-ink-muted)' }} aria-label="Close logging form">
            <X size={24} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
            <p style={{ color: 'var(--color-ink-muted)' }}>Loading activity configurations...</p>
          </div>
        </div>
      </div>
    );
  }

  const handleCategorySelect = (selectedCat) => {
    setCategory(selectedCat);
    
    // Set default subtypes based on onboarding configuration if present
    if (selectedCat === 'transport' && initialDefaults.default_commute_mode) {
      setSubType(initialDefaults.default_commute_mode);
    } else if (selectedCat === 'food' && initialDefaults.default_diet) {
      // Map diet name to meal subtype
      const dietMap = {
        omnivore: 'chicken_meal',
        vegetarian: 'vegetarian_meal',
        vegan: 'vegan_meal'
      };
      const fallback = factors?.[selectedCat] ? Object.keys(factors[selectedCat])[0] : '';
      setSubType(dietMap[initialDefaults.default_diet] || fallback);
    } else {
      const fallback = factors?.[selectedCat] ? Object.keys(factors[selectedCat])[0] : '';
      setSubType(fallback);
    }
    
    setStep(2);
  };

  const handleNextStep = () => {
    if (step === 2 && !subType) {
      setError('Please select a sub-type.');
      return;
    }
    setError('');
    setStep(step + 1);
  };

  const handlePrevStep = () => {
    setError('');
    setStep(step - 1);
  };

  // Compute live preview footprint using server-authoritative factors (cached)
  let livePreviewKg = null;
  const numQty = parseFloat(quantity);
  if (category && subType && !isNaN(numQty) && numQty > 0 && factors) {
    const factorData = factors[category]?.[subType];
    if (factorData) {
      livePreviewKg = numQty * factorData.factor;
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!quantity || isNaN(numQty) || numQty <= 0) {
      setError('Please enter a valid quantity greater than 0.');
      return;
    }
    if (numQty >= 100000) {
      setError('Please enter a quantity less than 100,000.');
      return;
    }
    if (!date) {
      setError('Please select a date.');
      return;
    }

    let recDays = null;
    if (isRecurring) {
      if (recurringType === 'daily') {
        recDays = null;
      } else if (recurringType === 'weekdays') {
        recDays = '1,2,3,4,5';
      } else if (recurringType === 'weekends') {
        recDays = '0,6';
      } else if (recurringType === 'custom') {
        const days = Object.keys(selectedDays).filter(d => selectedDays[d]);
        if (days.length === 0) {
          setError('Please select at least one day for custom recurring log.');
          return;
        }
        recDays = days.join(',');
      }
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await apiFetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          sub_type: subType,
          quantity: numQty,
          activity_date: date,
          is_recurring: isRecurring,
          recurring_days: recDays
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save activity');
      }

      onSuccess(data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentUnit = category && subType && factors?.[category]?.[subType] ? factors[category][subType].unit : '';

  return (
    <div className="drawer-overlay" onClick={onClose} role="none">
      <div 
        className="drawer" 
        onClick={(e) => e.stopPropagation()} 
        role="dialog" 
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <button 
          type="button" 
          onClick={onClose} 
          style={{ position: 'absolute', top: '20px', right: '20px', color: 'var(--color-ink-muted)' }}
          aria-label="Close logging form"
        >
          <X size={24} />
        </button>

        <h2 id="drawer-title" style={{ marginBottom: '24px', color: 'var(--color-primary)' }}>
          Log an Activity
        </h2>

        {error && (
          <div 
            style={{ 
              padding: '12px', 
              backgroundColor: 'var(--color-caution-light)', 
              color: 'var(--color-caution)', 
              borderRadius: 'var(--radius-sm)',
              marginBottom: '16px',
              fontSize: '14px',
              borderLeft: '4px solid var(--color-caution)'
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Step 1: Category Selection */}
        {step === 1 && (
          !factors ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', justifyContent: 'center', padding: '24px 0' }}>
              <p style={{ color: 'var(--color-ink-muted)', textAlign: 'center' }}>Could not load emission factors reference data. Please try again.</p>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={() => {
                  setIsLoadingFactors(true);
                  setError('');
                  getFactors()
                    .then(f => {
                      if (f && typeof f === 'object' && ('transport' in f || 'energy' in f)) {
                        setFactors(f);
                      } else {
                        setError('Failed to load emission factors reference data.');
                      }
                      setIsLoadingFactors(false);
                    })
                    .catch(() => {
                      setError('Failed to load emission factors reference data.');
                      setIsLoadingFactors(false);
                    });
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="animate-fade-in">
              <p style={{ marginBottom: '8px' }}>Select an activity category to begin:</p>
              
              <button 
                ref={firstBtnRef}
                onClick={() => handleCategorySelect('transport')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  padding: '16px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface)',
                  width: '100%',
                  gap: '16px',
                  textAlign: 'left'
                }}
                className="card-hoverable"
              >
                <div style={{ backgroundColor: 'var(--color-primary-light)', padding: '12px', borderRadius: '50%', color: 'var(--color-primary)' }}>
                  <Bike size={24} />
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '16px' }}>Transport</strong>
                  <span style={{ fontSize: '13px', color: 'var(--color-ink-muted)' }}>Commutes, road trips, flights</span>
                </div>
              </button>

              <button 
                onClick={() => handleCategorySelect('energy')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  padding: '16px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface)',
                  width: '100%',
                  gap: '16px',
                  textAlign: 'left'
                }}
                className="card-hoverable"
              >
                <div style={{ backgroundColor: '#FCF4EB', padding: '12px', borderRadius: '50%', color: 'var(--color-caution)' }}>
                  <Zap size={24} />
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '16px' }}>Home Energy</strong>
                  <span style={{ fontSize: '13px', color: 'var(--color-ink-muted)' }}>Electricity grid usage, cooking gas</span>
                </div>
              </button>

              <button 
                onClick={() => handleCategorySelect('food')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  padding: '16px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface)',
                  width: '100%',
                  gap: '16px',
                  textAlign: 'left'
                }}
                className="card-hoverable"
              >
                <div style={{ backgroundColor: 'var(--color-positive-light)', padding: '12px', borderRadius: '50%', color: 'var(--color-positive)' }}>
                  <Utensils size={24} />
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '16px' }}>Food & Diet</strong>
                  <span style={{ fontSize: '13px', color: 'var(--color-ink-muted)' }}>Beef, chicken, vegetarian or vegan meals</span>
                </div>
              </button>

              <button 
                onClick={() => handleCategorySelect('consumption')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  padding: '16px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface)',
                  width: '100%',
                  gap: '16px',
                  textAlign: 'left'
                }}
                className="card-hoverable"
              >
                <div style={{ backgroundColor: '#F0EFFF', padding: '12px', borderRadius: '50%', color: '#635BFF' }}>
                  <ShoppingBag size={24} />
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '16px' }}>Consumption & Waste</strong>
                  <span style={{ fontSize: '13px', color: 'var(--color-ink-muted)' }}>Fast fashion purchases, electronics, landfill waste</span>
                </div>
              </button>
            </div>
          )
        )}

        {/* Step 2: Sub-Type Selection */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} className="animate-fade-in">
            <div className="form-group">
              <label htmlFor="subtype-select">What kind of {category} activity was this?</label>
              <select
                id="subtype-select"
                ref={subTypeSelectRef}
                value={subType}
                onChange={(e) => setSubType(e.target.value)}
              >
                {category && factors?.[category] && Object.keys(factors[category]).map((key) => (
                  <option key={key} value={key}>
                    {SUB_TYPE_LABELS[category]?.[key] || key}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="btn-secondary" onClick={handlePrevStep} style={{ flex: 1 }}>
                <ArrowLeft size={16} /> Back
              </button>
              <button type="button" className="btn-primary" onClick={handleNextStep} style={{ flex: 1 }}>
                Next <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Quantity, Date & Submission */}
        {step === 3 && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} className="animate-fade-in">
            <div className="form-group">
              <label htmlFor="quantity-input">
                How much did you use/consume? ({currentUnit})
              </label>
              <input
                id="quantity-input"
                ref={quantityInputRef}
                type="number"
                step="any"
                placeholder={`Enter amount in ${currentUnit}`}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="date-input">When did this occur?</label>
              <input
                id="date-input"
                type="date"
                value={date}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            {/* Recurring activity checkbox & options */}
            <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                id="recurring-checkbox"
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="recurring-checkbox" style={{ cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                Make this activity recurring (auto-repeat log)
              </label>
            </div>

            {isRecurring && (
              <div style={{
                backgroundColor: 'var(--color-bg)',
                padding: '16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }} className="animate-fade-in">
                <label style={{ fontSize: '13px', fontWeight: '600' }}>Repeat Pattern:</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {['daily', 'weekdays', 'weekends', 'custom'].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setRecurringType(type)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        borderRadius: '16px',
                        backgroundColor: recurringType === type ? 'var(--color-primary)' : 'var(--color-surface)',
                        color: recurringType === type ? 'var(--color-surface)' : 'var(--color-ink)',
                        border: '1px solid var(--color-border)',
                        textTransform: 'capitalize'
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                {recurringType === 'custom' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-ink-muted)' }}>Select custom days:</span>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'space-between' }}>
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => {
                        const isSel = selectedDays[idx];
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedDays(prev => ({ ...prev, [idx]: !prev[idx] }))}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              padding: 0,
                              fontSize: '12px',
                              fontWeight: '600',
                              backgroundColor: isSel ? 'var(--color-primary)' : 'var(--color-surface)',
                              color: isSel ? 'var(--color-surface)' : 'var(--color-ink)',
                              border: '1px solid var(--color-border)'
                            }}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Real-time preview */}
            {livePreviewKg !== null && (
              <div style={{
                backgroundColor: 'var(--color-primary-light)',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                marginTop: '16px',
                textAlign: 'center',
                border: '1px dashed var(--color-primary)'
              }}>
                <span style={{ fontSize: '14px', color: 'var(--color-primary-hover)', display: 'block', fontWeight: '500' }}>
                  ESTIMATED FOOTPRINT
                </span>
                <strong style={{ fontSize: '28px', color: 'var(--color-primary)', display: 'block', margin: '4px 0' }}>
                  ≈ {livePreviewKg.toFixed(1)} kg CO2e
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--color-ink-muted)' }}>
                  Will be recorded using official factors on submit.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="btn-secondary" onClick={handlePrevStep} style={{ flex: 1 }} disabled={isSubmitting}>
                <ArrowLeft size={16} /> Back
              </button>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : <><Save size={16} /> Save Log</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
