import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({ supabase: null }));
const assemble = vi.fn();
vi.mock('../lib/assemblage', () => ({ assembleParcels: (...a: unknown[]) => assemble(...a) }));
const ui = vi.hoisted(() => ({ selectedParcel: null as Record<string, unknown> | null }));
vi.mock('../store/ui', () => ({ useUIStore: () => ui }));

import MultiParcelAnalysis from './MultiParcelAnalysis';

const seed = { ogc_fid: 488278, address: '1710 Meharry Blvd', parcelnumb: '09203040100', deeded_acres: 1.8, sqft: 78408, zoning: 'RM20', parval: 900000 };

describe('MultiParcelAnalysis (assemblage)', () => {
  it('starts with the parcel the user came from', () => {
    render(<MultiParcelAnalysis isOpen onClose={() => undefined} seed={seed as never} />);
    expect(screen.getByText('1 parcel selected')).toBeTruthy();
    expect(screen.getByText('1710 Meharry Blvd')).toBeTruthy();
    // adding is by search, not by clicking a map that is behind the dialog
    expect(screen.getByTestId('assemblage-add')).toBeTruthy();
  });

  it('closes on Escape and names its close control', () => {
    const onClose = vi.fn();
    render(<MultiParcelAnalysis isOpen onClose={onClose} seed={seed as never} />);
    expect(screen.getByLabelText('Close assemblage')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lets a parcel be removed by name', () => {
    render(<MultiParcelAnalysis isOpen onClose={() => undefined} seed={seed as never} />);
    fireEvent.click(screen.getByLabelText('Remove 1710 Meharry Blvd from the assemblage'));
    expect(screen.getByText('0 parcels selected')).toBeTruthy();
  });

  describe('plan as one site', () => {
    const second = { ogc_fid: 488279, address: '1712 Meharry Blvd', parcelnumb: '09203040200', deeded_acres: 0.4, sqft: 17424, zoning: 'RM20', parval: 200000 };

    it('needs two parcels', () => {
      ui.selectedParcel = null;
      render(<MultiParcelAnalysis isOpen onClose={() => undefined} seed={seed as never} />);
      expect((screen.getByTestId('assemblage-plan-button') as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText('Add a second parcel to combine them.')).toBeTruthy();
    });

    it('opens the planner on the combined site', async () => {
      ui.selectedParcel = second;
      assemble.mockResolvedValueOnce({ status: 'ready', ogcFid: 9100001, address: '1710 Meharry Blvd + 1 more', zoning: 'RM20', acres: 2.2 });
      const onClose = vi.fn();
      const opened: unknown[] = [];
      const listen = (e: Event) => opened.push((e as CustomEvent).detail);
      document.addEventListener('openParcelDrawer', listen);
      render(<MultiParcelAnalysis isOpen onClose={onClose} seed={seed as never} />);
      fireEvent.click(screen.getByTestId('assemblage-plan-button'));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      document.removeEventListener('openParcelDrawer', listen);
      expect(assemble).toHaveBeenCalledWith(expect.arrayContaining(['488278', '488279']));
      expect(opened).toEqual([{ ogc_fid: '9100001', address: '1710 Meharry Blvd + 1 more', zoning: 'RM20', openPlanner: true }]);
    });

    it('says why a set cannot be combined and stays open', async () => {
      ui.selectedParcel = second;
      assemble.mockResolvedValueOnce({ status: 'refused', code: 'not_adjacent', message: 'These parcels do not all touch.' });
      const onClose = vi.fn();
      render(<MultiParcelAnalysis isOpen onClose={onClose} seed={seed as never} />);
      fireEvent.click(screen.getByTestId('assemblage-plan-button'));
      await waitFor(() => expect(screen.getByTestId('assemblage-plan-note').textContent).toBe('These parcels do not all touch.'));
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
