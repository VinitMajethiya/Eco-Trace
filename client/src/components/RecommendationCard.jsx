import React, { useState } from 'react';
import { Target, Award, RefreshCw, Zap } from 'lucide-react';

export default function RecommendationCard({ planData, onCommitSuccess, onRefresh, loading }) {
  const [committingId, setCommittingId] = useState(null);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleCommit = async (actionId) => {
    setCommittingId(actionId);
    setError('');
    try {
      const response = await fetch('/api/recommendations/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_item_id: actionId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to register commitment');
      }

      onCommitSuccess(data.commitment);
    } catch (err) {
      setError(err.message);
    } finally {
      setCommittingId(null);
    }
  };

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    setError('');
    try {
      await onRefresh();
    } catch {
      setError('Failed to refresh plan.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const showLoader = loading || isRefreshing;

  const renderLoaderOverlay = () => {
    if (!showLoader) return null;
    return (
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--color-surface-overlay)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        gap: '12px'
      }}>
        <RefreshCw size={32} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
        <span style={{ fontWeight: '500', color: 'var(--color-ink)', fontSize: '14px' }}>Analyzing activity trends...</span>
      </div>
    );
  };

  if (!planData || planData.unlocked === false) {
    return (
      <div className="card" style={{ textAlign: 'center', borderStyle: 'dashed', position: 'relative', overflow: 'hidden' }}>
        {renderLoaderOverlay()}
        <Zap size={32} style={{ color: 'var(--color-ink-muted)', marginBottom: '16px' }} />
        <h3 style={{ marginBottom: '8px' }}>AI Coaching Locked</h3>
        <p style={{ maxWidth: '450px', margin: '0 auto', fontSize: '15px' }}>
          {planData?.message || 'Log at least 5 activities across any category to unlock your AI coaching recommendations. Keep logging!'}
        </p>
      </div>
    );
  }

  const { recommendation, actions } = planData;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', overflow: 'hidden' }}>
      {renderLoaderOverlay()}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h3 style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Target size={20} /> Your Carbon Reduction Coach
        </h3>
        
        <button 
          onClick={handleRefreshClick}
          className="btn-text" 
          style={{ padding: '4px 8px', fontSize: '13px' }}
          disabled={isRefreshing}
          aria-label="Refresh recommendations"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Coach'}
        </button>
      </div>

      <p style={{ 
        fontSize: '16px', 
        color: 'var(--color-ink)', 
        lineHeight: '1.6', 
        backgroundColor: 'var(--color-bg)',
        padding: '16px',
        borderRadius: 'var(--radius-md)',
        borderLeft: '4px solid var(--color-primary)'
      }}>
        "{recommendation?.summary_text}"
      </p>

      {error && (
        <div style={{ 
          fontSize: '14px', 
          color: 'var(--color-caution)', 
          backgroundColor: 'var(--color-caution-light)',
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)'
        }}>
          {error}
        </div>
      )}

      <div>
        <h4 style={{ fontSize: '15px', color: 'var(--color-ink-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Suggested Challenges
        </h4>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {actions && actions.map((action) => (
            <div 
              key={action.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 18px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface)'
              }}
              className="card-hoverable animate-slide-up"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1', paddingRight: '16px' }}>
                <span style={{ fontSize: '15px', color: 'var(--color-ink)', fontWeight: '500' }}>
                  {action.action_text}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--color-positive)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Award size={14} /> Saves ~{action.estimated_saving_kg.toFixed(1)} kg CO2e / month
                </span>
              </div>

              <button
                className="btn-primary"
                style={{ padding: '8px 16px', fontSize: '13px', flexShrink: 0 }}
                onClick={() => handleCommit(action.id)}
                disabled={committingId !== null || isRefreshing}
              >
                {committingId === action.id ? 'Committing...' : 'Commit'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
