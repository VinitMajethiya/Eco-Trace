import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TrendChartSection from '../components/TrendChartSection';
import CategoryDonutSection from '../components/CategoryDonutSection';

// Spy functions to capture props passed to Recharts primitives
const mockArea = vi.fn();
const mockTooltip = vi.fn();
const mockPie = vi.fn();

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: (props) => {
    mockPie(props);
    return <div>Pie</div>;
  },
  Cell: () => <div>Cell</div>,
  AreaChart: ({ children }) => <div>{children}</div>,
  Area: (props) => {
    mockArea(props);
    return <div>Area</div>;
  },
  XAxis: () => <div>XAxis</div>,
  YAxis: () => <div>YAxis</div>,
  Tooltip: (props) => {
    mockTooltip(props);
    return <div>Tooltip</div>;
  },
  Legend: () => <div>Legend</div>,
}));

describe('Chart Animations and prefers-reduced-motion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables animation for Area, Tooltip, and Pie when prefers-reduced-motion is true', () => {
    // Mock matchMedia to return true for reduced motion
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    // Render TrendChartSection
    const trendData = [{ label: 'Week 1', total: 10 }];
    render(<TrendChartSection trend={trendData} />);

    // Assert that Area and Tooltip received isAnimationActive: false
    expect(mockArea).toHaveBeenCalled();
    expect(mockArea.mock.calls[0][0].isAnimationActive).toBe(false);

    expect(mockTooltip).toHaveBeenCalled();
    expect(mockTooltip.mock.calls[0][0].isAnimationActive).toBe(false);

    // Render CategoryDonutSection
    const categoryData = [{ category: 'transport', co2e_kg: 50, percentage: 100 }];
    render(<CategoryDonutSection categoryBreakdown={categoryData} />);

    // Assert that Pie received isAnimationActive: false
    expect(mockPie).toHaveBeenCalled();
    expect(mockPie.mock.calls[0][0].isAnimationActive).toBe(false);
  });

  it('enables animation for Area, Tooltip, and Pie when prefers-reduced-motion is false', () => {
    // Mock matchMedia to return false for reduced motion
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    // Render TrendChartSection
    const trendData = [{ label: 'Week 1', total: 10 }];
    render(<TrendChartSection trend={trendData} />);

    expect(mockArea).toHaveBeenCalled();
    expect(mockArea.mock.calls[0][0].isAnimationActive).toBe(true);

    expect(mockTooltip).toHaveBeenCalled();
    expect(mockTooltip.mock.calls[0][0].isAnimationActive).toBe(true);

    // Render CategoryDonutSection
    const categoryData = [{ category: 'transport', co2e_kg: 50, percentage: 100 }];
    render(<CategoryDonutSection categoryBreakdown={categoryData} />);

    expect(mockPie).toHaveBeenCalled();
    expect(mockPie.mock.calls[0][0].isAnimationActive).toBe(true);
  });
});
