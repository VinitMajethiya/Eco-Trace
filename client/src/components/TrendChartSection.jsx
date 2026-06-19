import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { useReducedMotion } from '../hooks/useReducedMotion';

export default function TrendChartSection({ trend }) {
  const reduced = useReducedMotion();

  return (
    <div className="card">
      <h3 style={{ fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-ink-muted)', marginBottom: '20px' }}>
        Footprint Trend — 8 Completed Weeks
      </h3>
      
      {/* Screen reader table alternative for accessibility */}
      <table className="sr-only">
        <caption>Weekly carbon footprint trend for the past 8 weeks</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Emissions (kg CO2e)</th>
          </tr>
        </thead>
        <tbody>
          {trend && trend.map((t, idx) => (
            <tr key={idx}>
              <td>{t.label}</td>
              <td>{t.total ? t.total.toFixed(1) : 0} kg</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ width: '100%', height: '260px' }}>
        {trend && trend.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="label" stroke="var(--color-ink-muted)" fontSize={12} tickLine={false} />
              <YAxis stroke="var(--color-ink-muted)" fontSize={12} tickLine={false} />
              <Tooltip 
                isAnimationActive={!reduced}
                contentStyle={{ 
                  backgroundColor: 'var(--color-surface)', 
                  borderColor: 'var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: 'var(--shadow-md)',
                  fontFamily: 'var(--font-family)'
                }} 
                formatter={(value) => [`${value} kg CO2e`]}
              />
              <Area isAnimationActive={!reduced} type="monotone" dataKey="total" stroke="var(--color-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorTrend)" name="Weekly Footprint" />

            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <p style={{ fontSize: '14px', color: 'var(--color-ink-muted)' }}>No trend data available.</p>
          </div>
        )}
      </div>
    </div>
  );
}
