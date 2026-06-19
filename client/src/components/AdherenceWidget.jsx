import React from 'react';
import { Calendar, CheckCircle2, AlertTriangle, Flame, Leaf } from 'lucide-react';

export default function AdherenceWidget({ commitments }) {
  if (!commitments || commitments.length === 0) {
    return (
      <div className="card" style={{ 
        textAlign: 'center', 
        padding: '32px 20px', 
        borderStyle: 'dashed', 
        borderWidth: '2px', 
        borderColor: 'var(--color-border)', 
        backgroundColor: 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px'
      }}>
        <Leaf size={32} style={{ color: 'var(--color-primary)', opacity: 0.7 }} />
        <h3 style={{ fontSize: '16px', color: 'var(--color-ink)' }}>No Active Challenges</h3>
        <p style={{ fontSize: '14px', color: 'var(--color-ink-muted)', lineHeight: '1.5' }}>
          Ready for a challenge? Commit to one of the suggestions in your Reduction Plan to start tracking your carbon savings!
        </p>
      </div>
    );
  }

  const activeCommitments = commitments.filter(c => c.status === 'active');
  const pastCommitments = commitments.filter(c => c.status !== 'active');

  const getStatusBadge = (status) => {
    switch (status) {
      case 'success':
        return (
          <span style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '4px', 
            padding: '4px 8px', 
            backgroundColor: 'var(--color-positive-light)', 
            color: 'var(--color-positive)', 
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600'
          }}>
            <CheckCircle2 size={12} /> Success
          </span>
        );
      case 'partial':
        return (
          <span style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '4px', 
            padding: '4px 8px', 
            backgroundColor: 'var(--color-primary-light)', 
            color: 'var(--color-primary)', 
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600'
          }}>
            <Flame size={12} /> Progress Made
          </span>
        );
      case 'missed':
        return (
          <span style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '4px', 
            padding: '4px 8px', 
            backgroundColor: 'var(--color-caution-light)', 
            color: 'var(--color-caution)', 
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600'
          }}>
            <AlertTriangle size={12} /> Nice Try
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Active Commitments Section */}
      {activeCommitments.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--color-primary)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)', marginBottom: '16px' }}>
            <Calendar size={20} /> Active Commits
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {activeCommitments.map(commit => {
              const { progress } = commit;
              const elapsedDays = progress?.elapsed_days || 1;
              const co2eSaved = progress?.co2e_saved_kg || 0;
              const logsCount = progress?.logs_count || 0;
              const actualEmissions = progress?.actual_emissions;

              const baseline = commit.baseline_co2e_kg ?? 0;
              const targetSaving = commit.estimated_saving_kg ?? 0;

              // Savings-based progress percentage
              let progressPct = 0;
              if (actualEmissions !== undefined && actualEmissions !== null && targetSaving > 0) {
                progressPct = Math.min(100, Math.round(Math.max(0, (baseline - actualEmissions) / targetSaving * 100)));
              }

              const baselineStr = commit.baseline_co2e_kg !== undefined && commit.baseline_co2e_kg !== null
                ? commit.baseline_co2e_kg.toFixed(1)
                : '0.0';

              return (
                <div key={commit.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }} className="animate-slide-up">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ fontSize: '15px', color: 'var(--color-ink)' }}>{commit.action_text}</strong>
                      <span style={{ display: 'block', fontSize: '13px', color: 'var(--color-ink-muted)', marginTop: '2px' }}>
                        Baseline: {baselineStr} kg | {logsCount === 0 ? 'No logs in period' : `Current: ${actualEmissions?.toFixed(1)} kg (${logsCount} logs)`}
                      </span>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: '16px', color: 'var(--color-positive)', display: 'block' }}>
                        +{co2eSaved.toFixed(1)} kg saved
                      </strong>
                      <span style={{ fontSize: '12px', color: 'var(--color-ink-muted)' }}>relative to baseline</span>
                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-ink-muted)', marginBottom: '4px' }}>
                      <span>Day {Math.min(7, elapsedDays)} of 7</span>
                      <span>{progressPct}% completed</span>
                    </div>
                    
                    <div style={{ 
                      width: '100%', 
                      height: '8px', 
                      backgroundColor: 'var(--color-bg)', 
                      borderRadius: '4px',
                      overflow: 'hidden',
                      border: '1px solid var(--color-border)'
                    }}>
                      <div style={{ 
                        width: `${progressPct}%`, 
                        height: '100%', 
                        backgroundColor: 'var(--color-primary)', 
                        borderRadius: '4px',
                        transition: 'width var(--transition-normal)'
                      }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Past Commitments Log */}
      {pastCommitments.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: '16px', color: 'var(--color-ink)', marginBottom: '16px' }}>
            Commitment Achievements
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pastCommitments.slice(0, 5).map(commit => {
              const outcomeMessage = commit.status === 'success'
                ? `Awesome! You reduced your ${commit.target_category} footprint by over 50% of your target.`
                : commit.status === 'partial'
                ? `Good progress! You successfully reduced your ${commit.target_category} emissions below your baseline.`
                : `You didn't reach the target this time. Let's try a different strategy next week!`;

              return (
                <div 
                  key={commit.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg)'
                  }}
                >
                  <div style={{ marginTop: '2px' }}>
                    {getStatusBadge(commit.status)}
                  </div>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--color-ink)', display: 'block' }}>
                      {commit.action_text}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--color-ink-muted)', display: 'block', marginTop: '2px' }}>
                      {outcomeMessage}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
