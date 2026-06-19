import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ActivityForm from '../components/ActivityForm';

describe('ActivityForm Component', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url.includes('/api/reference/emission-factors')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            transport: {
              car_petrol: { factor: 0.192, unit: 'km' }
            }
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ 
          id: 123, 
          co2e_kg: 19.2, 
          category: 'transport', 
          sub_type: 'car_petrol', 
          quantity: 100, 
          activity_date: '2026-06-17' 
        }),
      });
    }));
  });

  it('navigates the 3-step slide drawer correctly and calculates live carbon estimates', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <ActivityForm 
        isOpen={true} 
        onClose={handleClose} 
        onSuccess={handleSuccess} 
        initialDefaults={{ default_commute_mode: 'car_petrol' }}
      />
    );

    // Step 1: Select Category
    expect(await screen.findByText('Log an Activity')).toBeInTheDocument();
    expect(screen.getByText('Select an activity category to begin:')).toBeInTheDocument();

    const transportButton = screen.getByRole('button', { name: /transport/i });
    fireEvent.click(transportButton);

    // Step 2: Select Subtype
    expect(screen.getByText('What kind of transport activity was this?')).toBeInTheDocument();
    
    const nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);

    // Step 3: Enter Quantity and Date
    expect(screen.getByLabelText(/how much did you use\/consume/i)).toBeInTheDocument();
    
    const quantityInput = screen.getByLabelText(/how much did you use\/consume/i);
    // Enter quantity 100 (which for car_petrol with factor 0.192 will compute live estimate 19.2 kg CO2e)
    fireEvent.change(quantityInput, { target: { value: '100' } });

    // Assert live preview calculation displays: 100 * 0.192 = 19.2
    expect(screen.getByText(/estimated footprint/i)).toBeInTheDocument();
    expect(screen.getByText(/19\.2/i)).toBeInTheDocument();

    // Submit the form
    const saveButton = screen.getByRole('button', { name: /save log/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/activities', expect.any(Object));
      expect(handleSuccess).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
