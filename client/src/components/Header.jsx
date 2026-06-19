import React from 'react';
import { Leaf, LogOut, Sun, Moon, User, Trash2 } from 'lucide-react';

export default function Header({ 
  isAuthenticated, 
  user, 
  theme, 
  onToggleTheme, 
  onLogout, 
  onDeleteAccount, 
  isRegister, 
  onToggleAuthMode 
}) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo"><Leaf /> EcoTrace</div>
        
        <div className="nav-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            className="btn-secondary" 
            onClick={onToggleTheme} 
            style={{ padding: '8px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>

          {!isAuthenticated ? (
            <button className="btn-secondary" onClick={onToggleAuthMode}>
              {isRegister ? 'Login' : 'Sign Up'}
            </button>
          ) : (
            <>
              {user?.default_commute_mode ? (
                <>
                  <span style={{ fontSize: '14px', color: 'var(--color-ink)', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: '500' }}>
                    <User size={16} /> Hi, {user.name}
                  </span>
                  <button 
                    className="btn-secondary" 
                    onClick={onDeleteAccount}
                    style={{ padding: '6px 12px', fontSize: '13px', color: 'var(--color-caution)' }}
                    title="Delete your account permanently"
                  >
                    <Trash2 size={14} /> Delete Account
                  </button>
                  <button className="btn-secondary" onClick={onLogout} style={{ padding: '6px 12px', fontSize: '13px' }}>
                    <LogOut size={14} /> Logout
                  </button>
                </>
              ) : (
                <button className="btn-secondary" onClick={onLogout} style={{ padding: '8px' }}><LogOut size={16} /> Logout</button>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
