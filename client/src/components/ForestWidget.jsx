import React from 'react';

export default function ForestWidget({ greenTrees, grayTrees, onCoachTrigger }) {
  const totalTrees = greenTrees + grayTrees;
  const displayTotal = Math.min(50, totalTrees);
  
  // Distribute trees proportionally to make up the display count
  let displayGreen = 0;
  if (totalTrees > 0) {
    displayGreen = Math.round((greenTrees / totalTrees) * displayTotal);
  }
  const displayGray = displayTotal - displayGreen;

  const renderTree = (isGreen, index) => {
    const color = isGreen ? 'var(--color-primary)' : 'var(--color-border)';
    const className = isGreen ? 'tree-sway' : 'tree-gray';
    const cursor = isGreen ? 'default' : 'pointer';

    return (
      <svg
        key={index}
        className={className}
        onClick={isGreen ? undefined : onCoachTrigger}
        style={{
          width: '24px',
          height: '24px',
          cursor: cursor,
          transition: 'all var(--transition-fast)'
        }}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2L2 22h20L12 2z" fill={isGreen ? 'rgba(30, 70, 50, 0.15)' : 'none'} />
        <path d="M12 18v4" />
      </svg>
    );
  };

  const trees = [];
  for (let i = 0; i < displayGreen; i++) {
    trees.push(renderTree(true, `green-${i}`));
  }
  for (let i = 0; i < displayGray; i++) {
    trees.push(renderTree(false, `gray-${i}`));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      <style>{`
        @keyframes treeSway {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(3deg); }
        }
        .tree-sway {
          animation: treeSway 4s ease-in-out infinite;
          transform-origin: bottom center;
        }
        .tree-sway:hover {
          filter: drop-shadow(0 2px 4px rgba(30, 70, 50, 0.3));
        }
        .tree-gray:hover {
          stroke: var(--color-ink-muted);
          transform: scale(1.1);
        }
      `}</style>
      
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '4px', 
        maxHeight: '120px', 
        overflowY: 'auto',
        padding: '4px'
      }}>
        {trees.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)' }}>No trees in your forest yet.</p>
        ) : (
          trees
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--color-ink-muted)' }}>
        <span>
          <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>{greenTrees}</span> offset |{' '}
          <span style={{ color: 'var(--color-ink-muted)', fontWeight: 'bold' }}>{grayTrees}</span> owed
        </span>
        {totalTrees > 50 && <span style={{ fontWeight: 'bold' }}>50+ total trees</span>}
      </div>
    </div>
  );
}
