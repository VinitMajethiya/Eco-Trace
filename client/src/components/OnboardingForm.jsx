import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

export default function OnboardingForm({ completeOnboarding }) {
  const [commute, setCommute] = useState('car_petrol');
  const [diet, setDiet] = useState('omnivore');
  const [household, setHousehold] = useState(1);
  const [city, setCity] = useState('india_national');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await completeOnboarding(commute, diet, household, city);
    } catch (err) {
      setError(err.message || 'Failed to save defaults.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card animate-slide-up" style={{ maxWidth: '500px', width: '100%', padding: '32px' }}>
      <h2 style={{ color: 'var(--color-primary)', marginBottom: '12px' }}>Personalize Your Assistant</h2>
      <p style={{ fontSize: '15px', marginBottom: '24px' }}>
        Configure a few quick defaults to customize your carbon-accounting estimates. You can always override these values per log.
      </p>

      {error && (
        <div style={{ padding: '12px', backgroundColor: 'var(--color-caution-light)', color: 'var(--color-caution)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="form-group">
          <label htmlFor="onboard-city">Your City (for local benchmark comparisons):</label>
          <select id="onboard-city" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="mumbai">Mumbai</option>
            <option value="delhi">Delhi</option>
            <option value="bangalore">Bengaluru</option>
            <option value="chennai">Chennai</option>
            <option value="pune">Pune</option>
            <option value="kolkata">Kolkata</option>
            <option value="hyderabad">Hyderabad</option>
            <option value="india_national">Other / National Average</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="onboard-commute">Primary commute mode:</label>
          <select id="onboard-commute" value={commute} onChange={(e) => setCommute(e.target.value)}>
            <option value="car_petrol">Petrol Car</option>
            <option value="car_diesel">Diesel Car</option>
            <option value="cng_car">CNG Car</option>
            <option value="two_wheeler">Motorcycle/Scooter</option>
            <option value="auto_rickshaw">Auto-rickshaw</option>
            <option value="cab">Cab / Taxi</option>
            <option value="bus">Local Bus</option>
            <option value="train">Train</option>
            <option value="bicycle_walk">Bicycle / Walk</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="onboard-diet">Diet pattern:</label>
          <select id="onboard-diet" value={diet} onChange={(e) => setDiet(e.target.value)}>
            <option value="omnivore">Omnivore (Meat & Veg)</option>
            <option value="vegetarian">Vegetarian</option>
            <option value="vegan">Vegan</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="onboard-household">Household size (number of people):</label>
          <input
            id="onboard-household"
            type="number"
            min="1"
            value={household}
            onChange={(e) => setHousehold(parseInt(e.target.value) || 1)}
            required
          />
        </div>

        <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '12px' }} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : <>Enter Dashboard <ChevronRight size={16} /></>}
        </button>
      </form>
    </div>
  );
}
