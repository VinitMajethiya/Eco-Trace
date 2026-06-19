import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Dashboard from './components/Dashboard';
import RecommendationCard from './components/RecommendationCard';
import AdherenceWidget from './components/AdherenceWidget';
import ActivityForm from './components/ActivityForm';
import Header from './components/Header';
import AuthForms from './components/AuthForms';
import OnboardingForm from './components/OnboardingForm';
import QuickLogPanel from './components/QuickLogPanel';
import WeeklySummaryCard from './components/WeeklySummaryCard';
import { CheckCircle } from 'lucide-react';

function AppContent() {
  const { user, loading, login, register, logout, completeOnboarding, deleteAccount, isAuthenticated } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  
  // Drawer / UI Triggers
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteEmailConfirm, setDeleteEmailConfirm] = useState('');
  const [deleteError, setDeleteError] = useState('');
  
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  const [planData, setPlanData] = useState(null);
  const [commitments, setCommitments] = useState([]);
  const [toastMessage, setToastMessage] = useState('');
  const [isCoachLoading, setIsCoachLoading] = useState(false);

  // Theme Toggling with resilient localStorage block check
  const [theme, setTheme] = useState(() => {
    let initialTheme = 'light';
    try {
      initialTheme = localStorage.getItem('theme') || 'light';
    } catch {
      console.warn('localStorage is blocked in this sandboxed environment.');
    }
    return initialTheme;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Ignore write errors in sandbox
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Auto-load recommendation and commitments when dashboard refreshes
  useEffect(() => {
    if (isAuthenticated && user?.default_commute_mode) {
      setTimeout(() => setIsCoachLoading(true), 0);
      // Fetch plan
      fetch('/api/recommendations')
        .then(res => res.json())
        .then(data => {
          setPlanData(data);
          setIsCoachLoading(false);
        })
        .catch(err => {
          console.error('Error fetching plan:', err);
          setIsCoachLoading(false);
        });

      // Fetch commitments
      fetch('/api/recommendations/commitments')
        .then(res => res.json())
        .then(data => setCommitments(data))
        .catch(err => console.error('Error fetching commitments:', err));
    }
  }, [isAuthenticated, refreshTrigger, user]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const handleActivityLogged = (newActivity) => {
    showToast(`Activity logged: ${newActivity.co2e_kg.toFixed(1)} kg CO2e estimated.`);
    setRefreshTrigger(prev => !prev);
  };

  const handleCommitSuccess = () => {
    showToast('Challenge committed! Track your daily logs.');
    setRefreshTrigger(prev => !prev);
  };

  const handleCoachRefresh = async () => {
    setIsCoachLoading(true);
    try {
      const res = await fetch('/api/recommendations?refresh=true');
      const data = await res.json();
      setPlanData(data);
      showToast('Coach recommendations updated.');
    } catch (err) {
      console.error('Error updating recommendations:', err);
    } finally {
      setIsCoachLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg)' }}>
        <p style={{ color: 'var(--color-ink-muted)', fontSize: '18px' }}>Verifying credentials...</p>
      </div>
    );
  }

  // 1. Unauthenticated State
  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg)' }}>
        <Header 
          isAuthenticated={false} 
          theme={theme} 
          onToggleTheme={toggleTheme} 
          isRegister={isRegister}
          onToggleAuthMode={() => setIsRegister(!isRegister)}
        />

        <main style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '40px 20px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '48px', alignItems: 'center' }} className="grid-2">
            <div>
              <h2 style={{ fontSize: '42px', color: 'var(--color-primary)', lineHeight: '1.1', marginBottom: '20px' }}>
                Know your footprint.<br />Reduce it, step by step.
              </h2>
              <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '32px', maxWidth: '500px' }}>
                EcoTrace helps you quantify the carbon impact of your commutes, meals, and energy use. Receive personalized suggestions backed by our deterministic carbon-accounting engine.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ color: 'var(--color-positive)', display: 'flex' }}><CheckCircle size={20} /></div>
                  <span style={{ fontWeight: '500' }}>30-Second Activity Logging Drawer</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ color: 'var(--color-positive)', display: 'flex' }}><CheckCircle size={20} /></div>
                  <span style={{ fontWeight: '500' }}>Auditable Calculations & Public Citations</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ color: 'var(--color-positive)', display: 'flex' }}><CheckCircle size={20} /></div>
                  <span style={{ fontWeight: '500' }}>Supportive, Hallucination-Free Coach suggestions</span>
                </div>
              </div>
            </div>

            <AuthForms 
              login={login} 
              register={register} 
              isRegister={isRegister} 
              onToggleAuthMode={() => setIsRegister(!isRegister)} 
            />
          </div>
        </main>
      </div>
    );
  }

  // 2. Authenticated but Onboarding Incomplete State
  if (!user.default_commute_mode) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg)' }}>
        <Header 
          isAuthenticated={true} 
          user={user} 
          theme={theme} 
          onToggleTheme={toggleTheme} 
          onLogout={logout}
        />

        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
          <OnboardingForm 
            completeOnboarding={completeOnboarding} 
            logout={logout} 
          />
        </main>
      </div>
    );
  }

  // 3. Normal Authenticated & Onboarded State: Dashboard layout
  return (
    <div className="app-container">
      <Header 
        isAuthenticated={true} 
        user={user} 
        theme={theme} 
        onToggleTheme={toggleTheme} 
        onLogout={logout}
        onDeleteAccount={() => setIsDeleteModalOpen(true)}
      />

      <main className="main-content">
        <div className="dashboard-layout">
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <WeeklySummaryCard />
            <Dashboard 
              onLogTrigger={() => setIsQuickLogOpen(true)}
              onQuickLogTrigger={() => setIsQuickLogOpen(true)}
              refreshTrigger={refreshTrigger}
              setRefreshTrigger={setRefreshTrigger}
              defaults={user}
              showToast={showToast}
              commitments={commitments}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', position: 'sticky', top: '90px' }}>
            <RecommendationCard 
              planData={planData} 
              onCommitSuccess={handleCommitSuccess}
              onRefresh={handleCoachRefresh}
              loading={isCoachLoading}
            />

            <AdherenceWidget commitments={commitments} />
          </div>

        </div>
      </main>

      <ActivityForm 
        key={isLogOpen}
        isOpen={isLogOpen} 
        onClose={() => setIsLogOpen(false)} 
        onSuccess={handleActivityLogged}
        initialDefaults={user}
      />

      <QuickLogPanel 
        key={isQuickLogOpen}
        isOpen={isQuickLogOpen}
        onClose={() => setIsQuickLogOpen(false)}
        onSuccess={handleActivityLogged}
        onOpenDetailed={() => setIsLogOpen(true)}
      />

      {/* Delete Account Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="drawer-overlay animate-fade-in" style={{ justifyContent: 'center', alignItems: 'center' }} onClick={() => setIsDeleteModalOpen(false)}>
          <div className="card animate-slide-up" style={{ maxWidth: '400px', width: '90%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: 'var(--color-caution)' }}>Delete Your Account</h3>
            <p style={{ fontSize: '14px', color: 'var(--color-ink-muted)', lineHeight: '1.5' }}>
              Warning: This action is permanent and cannot be undone. All your activities, streak records, and coaching recommendations will be deleted forever.
            </p>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="confirm-email-input">Type your email (<strong>{user.email}</strong>) to confirm:</label>
              <input 
                id="confirm-email-input"
                type="email"
                placeholder={user.email}
                value={deleteEmailConfirm}
                onChange={(e) => setDeleteEmailConfirm(e.target.value)}
              />
            </div>
            {deleteError && (
              <span style={{ fontSize: '13px', color: 'var(--color-caution)' }}>{deleteError}</span>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeleteEmailConfirm('');
                  setDeleteError('');
                }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                style={{ backgroundColor: 'var(--color-caution)' }}
                disabled={deleteEmailConfirm !== user.email}
                onClick={async () => {
                  try {
                    await deleteAccount();
                    setIsDeleteModalOpen(false);
                    showToast('Account deleted successfully.');
                  } catch (err) {
                    setDeleteError(err.message || 'Failed to delete account.');
                  }
                }}
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="toast-container">
          <div className="toast">
            <CheckCircle size={18} style={{ color: 'var(--color-primary)' }} />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
