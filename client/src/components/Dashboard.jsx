import React from 'react';
import { Plus, Trash2, TrendingDown, TrendingUp, Leaf, Activity, Footprints, Trees, Flame } from 'lucide-react';
import WhyThisNumber from './WhyThisNumber';
import ForestWidget from './ForestWidget';
import ImpactStories from './ImpactStories';
import useDashboardData from '../hooks/useDashboardData';
const CategoryDonutSection = React.lazy(() => import('./CategoryDonutSection'));
const TrendChartSection = React.lazy(() => import('./TrendChartSection'));



const CATEGORY_LABELS = {
  transport: 'Transport',
  energy: 'Home Energy',
  food: 'Food & Diet',
  consumption: 'Consumption'
};

const LOGS_PER_PAGE = 10;

export default function Dashboard({ onLogTrigger, refreshTrigger, setRefreshTrigger, defaults, showToast, commitments }) {
  const {
    range,
    setRange,
    dashboardData,
    loading,
    error,
    activities,
    currentPage,
    setCurrentPage,
    totalPages,
    totalLogs,
    confirmDeleteId,
    setConfirmDeleteId,
    selectedCity,
    setSelectedCity,
    isUpdatingCity,
    handleDeleteActivity,
    handleUpdateCity
  } = useDashboardData({ defaults, refreshTrigger, setRefreshTrigger, showToast });

  if (loading && !dashboardData) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <p style={{ color: 'var(--color-ink-muted)' }}>Loading carbon calculations...</p>
      </div>
    );
  }

  const { totalCO2e, deltaPercentage, categoryBreakdown, trend, benchmark, streak } = dashboardData || {
    totalCO2e: 0,
    deltaPercentage: 0,
    categoryBreakdown: [],
    trend: [],
    benchmark: { value: 145, label: 'India Average' },
    streak: { current: 0, longest: 0 }
  };

  // Dynamic footprints icon proportional to carbon emissions (ceiling at twice the benchmark)
  const limit = benchmark.value * 2;
  const ratio = Math.min(1, totalCO2e / limit);
  const footprintColor = totalCO2e <= benchmark.value 
    ? 'var(--color-positive)' 
    : 'var(--color-caution)';
  // Explicitly round to 2 decimal places to prevent floating point mismatch and allow clean testing assertions
  const footprintOpacity = Math.round((0.15 + (ratio * 0.85)) * 100) / 100;

  // Offset standard: 1.8 kg CO2e / month per tree, 0.41 kg CO2e / week per tree (totalCO2e is in kg CO2e)
  const offsetFactor = range === 'month' ? 1.8 : 0.41;
  const treesNeeded = Math.ceil(totalCO2e / offsetFactor);

  const activeCommits = commitments?.filter(c => c.status === 'active') || [];
  const totalSaved = activeCommits.reduce((acc, c) => acc + (c.progress?.co2e_saved_kg || 0), 0);
  const greenTrees = Math.floor(totalSaved / offsetFactor);
  const grayTrees = Math.max(0, treesNeeded - greenTrees);

  const hasActivities = activities.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }} className="animate-fade-in">
      
      {/* Upper Panel: Period Select & Quick Log */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}><Leaf /> EcoTrace</span>
            {streak && streak.current > 0 && (
              <span style={{ 
                fontSize: '14px', 
                backgroundColor: 'var(--color-caution-light)', 
                color: 'var(--color-caution)', 
                padding: '4px 12px', 
                borderRadius: '16px', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '6px',
                fontWeight: '600',
                marginLeft: '8px'
              }} title={`Longest streak: ${streak.longest} days`}>
                <Flame size={16} fill="var(--color-caution)" /> {streak.current} Day Streak!
              </span>
            )}
          </h1>
          <p style={{ fontSize: '15px' }}>Track and reduce your personal carbon footprint, step-by-step.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Range Toggle */}
          <div style={{ 
            display: 'inline-flex', 
            backgroundColor: 'var(--color-border)', 
            padding: '2px', 
            borderRadius: 'var(--radius-sm)' 
          }}>
            <button 
              className={range === 'month' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '6px 14px', fontSize: '13px', borderRadius: '4px' }}
              onClick={() => setRange('month')}
            >
              This Month
            </button>
            <button 
              className={range === 'week' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '6px 14px', fontSize: '13px', borderRadius: '4px' }}
              onClick={() => setRange('week')}
            >
              This Week
            </button>
          </div>

          <button className="btn-primary" onClick={onLogTrigger}>
            <Plus size={16} /> Log Activity
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '16px', backgroundColor: 'var(--color-caution-light)', color: 'var(--color-caution)', borderRadius: 'var(--radius-md)' }}>
          {error}
        </div>
      )}

      {/* Main Metrics Row */}
      {!hasActivities ? (
        <div className="card" style={{ textAlign: 'center', padding: '80px 24px', backgroundColor: 'var(--color-surface)' }}>
          <Activity size={48} style={{ color: 'var(--color-primary)', opacity: 0.3, marginBottom: '20px' }} />
          <h2 style={{ marginBottom: '8px', color: 'var(--color-primary)' }}>Your Footprint is Clean!</h2>
          <p style={{ maxWidth: '500px', margin: '0 auto 24px auto', fontSize: '15px' }}>
            You haven't logged any activities yet. Log your commutes, food choices, fast fashion or energy bills to see your personalized carbon footprint analysis and start reducing it.
          </p>
          <button className="btn-primary" onClick={onLogTrigger}>
            Log Your First Activity
          </button>
        </div>
      ) : (
        <>
          {/* Grid: Stats Card + Donut Chart */}
          <div className="grid-2">
            
            {/* 1. Hero Footprint Stat */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-ink-muted)' }}>
                  Total Footprint ({range === 'month' ? 'Month' : 'Week'})
                </span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '48px', fontWeight: '800', color: 'var(--color-ink)', lineHeight: '1' }}>
                      {totalCO2e.toFixed(1)}
                    </span>
                    <span style={{ fontSize: '18px', color: 'var(--color-ink-muted)', marginLeft: '8px', fontWeight: '500' }}>
                      kg CO2e
                    </span>
                  </div>
                  <Footprints 
                    data-testid="footprint-icon"
                    size={38} 
                    style={{ 
                      color: footprintColor, 
                      opacity: footprintOpacity, 
                      transition: 'all var(--transition-fast)' 
                    }} 
                  />
                </div>
              </div>

              {/* Delta Comparison */}
              <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {deltaPercentage !== 0 ? (
                  <>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '4px',
                      color: deltaPercentage < 0 ? 'var(--color-positive)' : 'var(--color-caution)',
                      backgroundColor: deltaPercentage < 0 ? 'var(--color-positive-light)' : 'var(--color-caution-light)',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}>
                      {deltaPercentage < 0 ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                      {Math.abs(deltaPercentage)}%
                    </div>
                    <span style={{ fontSize: '14px', color: 'var(--color-ink-muted)' }}>
                      vs. previous {range}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: '14px', color: 'var(--color-ink-muted)' }}>
                    No baseline data from previous period to compare.
                  </span>
                )}
              </div>

              {/* Benchmark Bar */}
              <div style={{ marginTop: '32px', borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', marginBottom: '12px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--color-ink-muted)' }}>Compare:</span>
                    <select
                      value={selectedCity}
                      onChange={(e) => {
                        setSelectedCity(e.target.value);
                        handleUpdateCity(e.target.value);
                      }}
                      style={{ 
                        padding: '4px 8px', 
                        fontSize: '12px', 
                        border: '1px solid var(--color-border)', 
                        borderRadius: 'var(--radius-sm)', 
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-ink)',
                        cursor: 'pointer'
                      }}
                      disabled={isUpdatingCity}
                      aria-label="Select city benchmark"
                    >
                      <option value="mumbai">Mumbai</option>
                      <option value="delhi">Delhi</option>
                      <option value="bangalore">Bengaluru</option>
                      <option value="chennai">Chennai</option>
                      <option value="pune">Pune</option>
                      <option value="kolkata">Kolkata</option>
                      <option value="hyderabad">Hyderabad</option>
                      <option value="india_national">India National Average</option>
                    </select>
                  </div>
                  <strong style={{ color: totalCO2e <= benchmark.value ? 'var(--color-positive)' : 'var(--color-caution)' }}>
                    {totalCO2e <= benchmark.value ? 'Under average' : 'Above average'}
                  </strong>
                </div>
                
                {/* Horizontal comparative bar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ height: '24px', width: '100%', backgroundColor: 'var(--color-bg)', borderRadius: '4px', position: 'relative', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                    {/* User bar */}
                    <div style={{ 
                      height: '100%', 
                      width: `${Math.min(100, (totalCO2e / (benchmark.value * 2)) * 100)}%`, 
                      backgroundColor: totalCO2e <= benchmark.value ? 'var(--color-positive)' : 'var(--color-caution)',
                      transition: 'width var(--transition-normal)'
                    }} />
                    {/* Average benchmark marker */}
                    <div style={{ 
                      position: 'absolute', 
                      left: '50%', 
                      top: 0, 
                      bottom: 0, 
                      width: '2px', 
                      backgroundColor: 'var(--color-ink)', 
                      opacity: 0.5 
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-ink-muted)' }}>
                    <span>0 kg</span>
                    <span style={{ transform: 'translateX(50%)' }}>Average ({benchmark.value} kg)</span>
                    <span>{benchmark.value * 2} kg</span>
                  </div>
                </div>

                {/* Tree planting offset calculator */}
                <div style={{ 
                  marginTop: '20px', 
                  padding: '16px', 
                  backgroundColor: 'var(--color-primary-light)', 
                  borderRadius: 'var(--radius-md)', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '16px',
                  border: '1px solid var(--color-border)' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Trees size={24} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                    <div style={{ fontSize: '13px', color: 'var(--color-ink)', textAlign: 'left' }}>
                      <span style={{ color: 'var(--color-ink-muted)', display: 'block', fontWeight: '500', marginBottom: '2px' }}>Offset Calculator</span>
                      Plant <strong data-testid="offset-trees-count">{treesNeeded}</strong> {treesNeeded === 1 ? 'tree' : 'trees'} this {range} to offset your carbon footprint.
                    </div>
                  </div>
                  <ForestWidget greenTrees={greenTrees} grayTrees={grayTrees} onCoachTrigger={onLogTrigger} />
                </div>

              </div>
            </div>

            {/* 2. Category Breakdown Donut Chart */}
            <React.Suspense fallback={<div style={{ minHeight: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: 'var(--color-ink-muted)', fontSize: '14px' }}>Loading chart breakdown...</p></div>}>
              <CategoryDonutSection categoryBreakdown={categoryBreakdown} />
            </React.Suspense>
          </div>

          {/* Impact Stories Carousel */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <ImpactStories totalCO2e={totalCO2e} />
          </div>

          {/* 3. Trend Line Chart (Area Chart) */}
          <React.Suspense fallback={<div style={{ minHeight: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: 'var(--color-ink-muted)', fontSize: '14px' }}>Loading chart trend...</p></div>}>
            <TrendChartSection trend={trend} />
          </React.Suspense>


          {/* 4. Recent Activities List */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-ink-muted)' }}>
                Recent Logs
              </h3>
              <a
                href="/api/activities/export"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '13px',
                  color: 'var(--color-primary)',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: '500'
                }}
              >
                ↓ Export CSV
              </a>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-ink-muted)' }}>
                    <th style={{ padding: '12px 8px' }}>Date</th>
                    <th style={{ padding: '12px 8px' }}>Category</th>
                    <th style={{ padding: '12px 8px' }}>Sub-type</th>
                    <th style={{ padding: '12px 8px' }}>Amount</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right' }}>Footprint</th>
                    <th style={{ padding: '12px 8px', width: '50px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((act) => (
                    <tr key={act.id} style={{ borderBottom: '1px solid var(--color-border)' }} className="animate-slide-up">
                      <td data-label="Date" style={{ padding: '12px 8px', whiteSpace: 'nowrap' }}>
                        {new Date(act.activity_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td data-label="Category" style={{ padding: '12px 8px', textTransform: 'capitalize', fontWeight: '500' }}>
                        {CATEGORY_LABELS[act.category]}
                      </td>
                      <td data-label="Sub-type" style={{ padding: '12px 8px' }}>
                        {act.sub_type.replaceAll('_', ' ')}
                      </td>
                      <td data-label="Amount" style={{ padding: '12px 8px' }}>
                        {act.quantity} {act.unit}
                      </td>
                      <td data-label="Footprint" style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '600', color: 'var(--color-ink)' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                           {act.co2e_kg.toFixed(1)} kg CO2e
                           <WhyThisNumber category={act.category} subType={act.sub_type} quantity={act.quantity} co2e={act.co2e_kg} />
                        </div>
                      </td>
                      <td data-label="Actions" style={{ padding: '12px 8px', textAlign: 'center' }}>
                        <button 
                          onClick={() => setConfirmDeleteId(act.id)}
                          style={{ color: 'var(--color-caution)', padding: '4px' }}
                          title="Delete log"
                          aria-label={`Delete activity log of ${act.sub_type} on ${act.activity_date}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
 
            {/* Pagination Controls */}
            {totalLogs > LOGS_PER_PAGE && (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid var(--color-border)' 
              }}>
                <button 
                  className="btn-secondary" 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  style={{ padding: '6px 14px', fontSize: '13px' }}
                >
                  Previous
                </button>
                <span style={{ fontSize: '13px', color: 'var(--color-ink-muted)', fontWeight: '500' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button 
                  className="btn-secondary" 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  style={{ padding: '6px 14px', fontSize: '13px' }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}
      
      {confirmDeleteId !== null && (
        <div className="drawer-overlay animate-fade-in" style={{ justifyContent: 'center', alignItems: 'center' }} onClick={() => setConfirmDeleteId(null)}>
          <div className="card animate-slide-up" style={{ maxWidth: '400px', width: '90%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: 'var(--color-primary)' }}>Delete Activity Log</h3>
            <p style={{ fontSize: '14px', color: 'var(--color-ink-muted)', lineHeight: '1.5' }}>
              Are you sure you want to permanently delete this activity log? This will update your dashboard metrics and carbon calculations.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                style={{ backgroundColor: 'var(--color-caution)' }}
                onClick={() => {
                  handleDeleteActivity(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
