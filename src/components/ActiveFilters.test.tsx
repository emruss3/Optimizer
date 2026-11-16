import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ActiveFilters from './ActiveFilters';
import { useUIStore } from '../store/ui';

describe('ActiveFilters', () => {
  beforeEach(() => useUIStore.getState().setZoningFilters({ activeZones: [] }));

  it('shows nothing on an unfiltered map', () => {
    render(<ActiveFilters />);
    expect(screen.queryByTestId('active-filters')).toBeNull();
  });

  it('names each applied district, removes one, and clears all, telling the map each time', () => {
    useUIStore.getState().setZoningFilters({ activeZones: ['RM20', 'RS5'] });
    const reloads: unknown[] = [];
    const on = (e: Event) => reloads.push((e as CustomEvent).detail.zoningFilters);
    document.addEventListener('forceMapReload', on);
    render(<ActiveFilters />);
    expect(screen.getByText('Showing 2 zoning districts:')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Remove RS5 from the filter'));
    expect(useUIStore.getState().zoningFilters.activeZones).toEqual(['RM20']);
    fireEvent.click(screen.getByTestId('filters-clear-all'));
    expect(useUIStore.getState().zoningFilters.activeZones).toEqual([]);
    expect(reloads).toEqual([['RM20'], []]);
    expect(screen.queryByTestId('active-filters')).toBeNull();
    document.removeEventListener('forceMapReload', on);
  });
});
