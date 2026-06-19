import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Dashboard from '../components/Dashboard';

// Mock Recharts to avoid JSDOM dimensions rendering exceptions
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: () => <div>Pie</div>,
  Cell: () => <div>Cell</div>,
  AreaChart: ({ children }) => <div>{children}</div>,
  Area: () => <div>Area</div>,
  XAxis: () => <div>XAxis</div>,
  YAxis: () => <div>YAxis</div>,
  Tooltip: () => <div>Tooltip</div>,
  Legend: () => <div>Legend</div>,
}));

describe('Dashboard Component - Footprint and Trees Offset', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      const currentRange = url.includes('range=week') ? 'week' : 'month';
      const benchmarkVal = currentRange === 'week' ? 33.4 : 145;
      if (url.includes('/api/dashboard/summary')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            totalCO2e: 72.0, // 72 kg CO2e
            deltaPercentage: -10,
            categoryBreakdown: [
              { category: 'transport', co2e_kg: 40, percentage: 55.6 },
              { category: 'energy', co2e_kg: 32, percentage: 44.4 }
            ],
            trend: [],
            benchmark: { value: benchmarkVal, label: 'India Average' }
          })
        });
      }
      if (url.includes('/api/activities')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            activities: [
              { id: 1, category: 'transport', sub_type: 'car_petrol', quantity: 200, unit: 'km', co2e_kg: 38.4, activity_date: '2026-06-15' }
            ],
            total: 1,
            page: 1,
            limit: 10,
            totalPages: 1
          })
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    }));
  });

  it('calculates tree offsets and dynamic footprint styling correctly for monthly range', async () => {
    render(
      <Dashboard 
        onLogTrigger={vi.fn()} 
        refreshTrigger={false} 
        setRefreshTrigger={vi.fn()} 
        defaults={{}} 
      />
    );

    // Verify dynamic tree offset calculator: 72.0 / 1.8 = 40 trees
    await waitFor(() => {
      const treesCountElement = screen.getByTestId('offset-trees-count');
      expect(treesCountElement).toBeInTheDocument();
      expect(treesCountElement.textContent).toBe('40');
    });

    // Verify footprint icon rendering and opacity:
    // limit = 290, ratio = 72 / 290 = 0.2482
    // opacity = 0.15 + (0.2482 * 0.85) = 0.3609 => rounded to 0.36
    const footprintIcon = screen.getByTestId('footprint-icon');
    expect(footprintIcon).toBeInTheDocument();
    
    // Check that style contains opacity matches 0.36 exactly or via regex
    const opacityStyle = footprintIcon.getAttribute('style');
    expect(opacityStyle).toMatch(/opacity:\s*0\.36/);
  });

  it('calculates tree offsets correctly when switching to weekly range', async () => {
    render(
      <Dashboard 
        onLogTrigger={vi.fn()} 
        refreshTrigger={false} 
        setRefreshTrigger={vi.fn()} 
        defaults={{}} 
      />
    );

    // Wait for initial monthly render: 72 / 1.8 = 40 trees
    await waitFor(() => {
      expect(screen.getByTestId('offset-trees-count').textContent).toBe('40');
    });

    // Switch to weekly
    const weekButton = screen.getByRole('button', { name: /this week/i });
    fireEvent.click(weekButton);

    // Wait for weekly render: 72 / 0.41 = 176 trees
    await waitFor(() => {
      expect(screen.getByTestId('offset-trees-count').textContent).toBe('176');
    });
  });
});
