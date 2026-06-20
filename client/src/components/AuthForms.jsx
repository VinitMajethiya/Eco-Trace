import React, { useState, useEffect } from 'react';
import { apiFetch, API_BASE } from '../lib/apiClient';

export default function AuthForms({ login, register, isRegister, onToggleAuthMode }) {
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [householdSize, setHouseholdSize] = useState(1);
  const [authError, setAuthError] = useState('');
  const [oauthEnabled, setOauthEnabled] = useState(false);

  useEffect(() => {
    apiFetch('/api/auth/config')
      .then(res => res.json())
      .then(data => {
        if (data.googleOAuthEnabled) {
          setOauthEnabled(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isRegister) {
        await register(authName, authEmail, authPassword, householdSize);
      } else {
        await login(authEmail, authPassword);
      }
    } catch (err) {
      setAuthError(err.message || 'Authentication failed. Please try again.');
    }
  };

  return (
    <div className="card animate-slide-up" style={{ padding: '32px' }}>
      <h3 style={{ marginBottom: '24px', color: 'var(--color-primary)' }}>
        {isRegister ? 'Create Account' : 'Welcome Back'}
      </h3>

      {authError && (
        <div style={{ padding: '12px', backgroundColor: 'var(--color-caution-light)', color: 'var(--color-caution)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', fontSize: '14px' }}>
          {authError}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {isRegister && (
          <div className="form-group">
            <label htmlFor="reg-name">First Name</label>
            <input
              id="reg-name"
              type="text"
              placeholder="e.g. Aman"
              value={authName}
              onChange={(e) => setAuthName(e.target.value)}
              required
            />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="auth-email">Email Address</label>
          <input
            id="auth-email"
            type="email"
            placeholder="name@email.com"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            placeholder="Min. 6 characters"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            required
          />
        </div>

        {isRegister && (
          <div className="form-group">
            <label htmlFor="reg-household">Household Size</label>
            <input
              id="reg-household"
              type="number"
              min="1"
              value={householdSize}
              onChange={(e) => setHouseholdSize(parseInt(e.target.value) || 1)}
              required
            />
          </div>
        )}

        <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '8px' }}>
          {isRegister ? 'Sign Up' : 'Log In'}
        </button>
      </form>

      {oauthEnabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--color-border)' }} />
            <span style={{ fontSize: '13px', color: 'var(--color-ink-muted)' }}>or</span>
            <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--color-border)' }} />
          </div>
          <button 
            type="button" 
            onClick={() => window.location.href = API_BASE + '/api/auth/google?origin=' + encodeURIComponent(window.location.origin)}
            className="btn-secondary"
            style={{ 
              width: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '10px',
              padding: '10px',
              fontWeight: '500',
              borderColor: 'var(--color-border)'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.591.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.32 0 2.508.453 3.44 1.347l2.582-2.58C13.463.896 11.426 0 9 0 5.483 0 2.443 2.017.957 4.958l3.007 2.332C4.672 5.164 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </div>
      )}

      <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '14px' }}>
        {isRegister ? 'Already have an account?' : "Don't have an account yet?"}{' '}
        <button 
          type="button" 
          className="btn-text"
          onClick={() => {
            setAuthError('');
            onToggleAuthMode();
          }}
        >
          {isRegister ? 'Log In' : 'Sign Up'}
        </button>
      </p>
    </div>
  );
}
