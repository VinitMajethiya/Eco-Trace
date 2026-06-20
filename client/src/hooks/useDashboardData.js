import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiClient';

const LOGS_PER_PAGE = 10;

export default function useDashboardData({ defaults, refreshTrigger, setRefreshTrigger, showToast }) {
  const [range, setRange] = useState('month');
  const [dashboardData, setDashboardData] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [selectedCity, setSelectedCity] = useState(defaults?.city || 'india_national');
  const [isUpdatingCity, setIsUpdatingCity] = useState(false);

  const [prevDefaultsCity, setPrevDefaultsCity] = useState(defaults?.city);
  if (defaults?.city && defaults.city !== prevDefaultsCity) {
    setPrevDefaultsCity(defaults.city);
    setSelectedCity(defaults.city);
  }

  // Fetch dashboard summary and activities list
  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      setError('');
      try {
        const [dashRes, actRes] = await Promise.all([
          apiFetch(`/api/dashboard/summary?range=${range}`),
          apiFetch(`/api/activities?page=${currentPage}&limit=${LOGS_PER_PAGE}`)
        ]);

        if (!dashRes.ok || !actRes.ok) {
          throw new Error('Failed to load dashboard data');
        }

        const dashData = await dashRes.json();
        const actData = await actRes.json();

        const acts = actData.activities || [];
        const tPages = actData.totalPages || 1;

        if (currentPage > tPages && tPages > 0) {
          setCurrentPage(tPages);
          return;
        }

        setDashboardData(dashData);
        setActivities(acts);
        setTotalPages(tPages);
        setTotalLogs(actData.total || 0);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [range, currentPage, refreshTrigger]);

  const handleDeleteActivity = async (id) => {
    try {
      const response = await apiFetch(`/api/activities/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Failed to delete activity');
      }
      setRefreshTrigger(prev => !prev);
    } catch {
      if (showToast) showToast('Failed to delete activity. Please try again.');
    }
  };

  const handleUpdateCity = async (newCity) => {
    setIsUpdatingCity(true);
    try {
      const response = await apiFetch('/api/auth/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_commute_mode: defaults.default_commute_mode,
          default_diet: defaults.default_diet,
          household_size: defaults.household_size,
          city: newCity
        })
      });
      if (response.ok) {
        setRefreshTrigger(prev => !prev);
        if (showToast) showToast('City benchmark preference updated!');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdatingCity(false);
    }
  };

  return {
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
  };
}
