import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({ supabase: null }));

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
});
