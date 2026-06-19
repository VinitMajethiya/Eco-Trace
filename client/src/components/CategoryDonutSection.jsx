import React, { useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useReducedMotion } from '../hooks/useReducedMotion';


const CATEGORY_COLORS = {
  transport: '#2E6B4F',      // Forest Green
  energy: '#B8762E',         // Amber
  food: '#3F8A5B',           // Soft Green
  consumption: '#635BFF'     // Purple
};

const CATEGORY_LABELS = {
  transport: 'Transport',
  energy: 'Home Energy',
  food: 'Food & Diet',
  consumption: 'Consumption'
};

export default function CategoryDonutSection({ categoryBreakdown }) {
  const [hoveredCategory, setHoveredCategory] = useState(null);
  const reduced = useReducedMotion();

  // Only count activities that have co2e > 0 in the donut
  const donutData = categoryBreakdown.filter(c => c.co2e_kg > 0);
  
  // Top category derived from filtered donut data only (avoids selecting zero-value entries)
  const topDonutCategory = donutData.length > 0
    ? donutData.reduce((a, b) => a.co2e_kg > b.co2e_kg ? a : b, donutData[0])
    : null;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-ink-muted)', marginBottom: '16px' }}>
        Category Breakdown
      </h3>
      
      {donutData.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: '14px' }}>No category data to display.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          {/* Recharts Donut */}
          <div style={{ width: '180px', height: '180px', position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  isAnimationActive={!reduced}
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="co2e_kg"
                  nameKey="category"
                  onMouseEnter={(_, index) => setHoveredCategory(donutData[index].category)}
                  onMouseLeave={() => setHoveredCategory(null)}
                >

                  {donutData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={CATEGORY_COLORS[entry.category]} 
                      style={{
                        opacity: hoveredCategory === null || hoveredCategory === entry.category ? 1 : 0.6,
                        transition: 'opacity var(--transition-fast)'
                      }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none'
            }}>
              <span style={{ fontSize: '12px', color: 'var(--color-ink-muted)', display: 'block' }}>Top Category</span>
              <strong style={{ fontSize: '14px', color: 'var(--color-ink)', textTransform: 'capitalize' }}>
                {topDonutCategory?.category}
              </strong>
            </div>
          </div>

          {/* Accessible Breakdown Table & Legend */}
          <div style={{ flex: 1, minWidth: '180px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }} role="table" aria-label="Category Share Breakdown">
              <caption className="sr-only">Table showing breakdown of carbon emissions by activity category</caption>
              <thead>
                <tr className="sr-only">
                  <th scope="col">Category</th>
                  <th scope="col">CO2e (kg)</th>
                  <th scope="col">Share (%)</th>
                </tr>
              </thead>
              <tbody>
                {categoryBreakdown.map(cat => (
                  <tr 
                    key={cat.category} 
                    style={{ 
                      borderBottom: '1px solid var(--color-bg)',
                      opacity: hoveredCategory === null || hoveredCategory === cat.category ? 1 : 0.4,
                      transition: 'opacity var(--transition-fast)'
                    }}
                    onMouseEnter={() => setHoveredCategory(cat.category)}
                    onMouseLeave={() => setHoveredCategory(null)}
                  >
                    <td style={{ padding: '6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ 
                        display: 'inline-block', 
                        width: '10px', 
                        height: '10px', 
                        borderRadius: '50%', 
                        backgroundColor: CATEGORY_COLORS[cat.category] 
                      }} />
                      <span style={{ textTransform: 'capitalize', fontWeight: '500' }}>{CATEGORY_LABELS[cat.category]}</span>
                    </td>
                    <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--color-ink)' }}>
                      {cat.co2e_kg.toFixed(0)} kg
                    </td>
                    <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--color-ink-muted)', fontWeight: '500', width: '60px' }}>
                      {cat.percentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
