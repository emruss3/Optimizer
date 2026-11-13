import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const searchParcels = vi.fn();
vi.mock('../lib/parcelSearch', async orig => ({
  ...(await orig<typeof import('../lib/parcelSearch')>()),
  searchParcels: (...a: unknown[]) => searchParcels(...a),
}));

import StartPanel from './StartPanel';
import MapUnavailable from './MapUnavailable';
import { recordRecent } from '../lib/recentWork';

const opened = () => {
  const seen: unknown[] = [];
  const on = (e: Event) => seen.push((e as CustomEvent).detail);
  document.addEventListener('openParcelDrawer', on);
  return { seen, off: () => document.removeEventListener('openParcelDrawer', on) };
};

describe('StartPanel', () => {
  beforeEach(() => { localStorage.clear(); searchParcels.mockReset(); });

  it('finds a parcel by address or parcel ID and opens it', async () => {
    searchParcels.mockResolvedValue([{ ogcFid: 488278, address: '1710 Meharry Blvd', parcelNumber: '092 03 0 123.00', zoning: 'RM20' }]);
    const o = opened();
    render(<StartPanel />);
    fireEvent.change(screen.getByTestId('start-search'), { target: { value: '1710 Meh' } });
    fireEvent.click(await screen.findByText('1710 Meharry Blvd'));
    expect(searchParcels).toHaveBeenCalledWith('1710 Meh');
    expect(o.seen[0]).toMatchObject({ ogc_fid: '488278', openPlanner: false });
    o.off();
  });

  it('says a failed search failed, not that nothing matched', async () => {
    searchParcels.mockRejectedValue(new Error('network down'));
    render(<StartPanel />);
    fireEvent.change(screen.getByTestId('start-search'), { target: { value: 'Main St' } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/did not go through \(network down\)/));
    expect(screen.queryByText(/No parcel matches/)).toBeNull();
  });

  it('keeps the query and offers another try when a search fails', async () => {
    searchParcels.mockRejectedValueOnce(new Error('no answer after 12 seconds'));
    searchParcels.mockResolvedValueOnce([{ ogcFid: 1, address: '12 Main St', parcelNumber: null, zoning: 'RS5' }]);
    render(<StartPanel />);
    fireEvent.change(screen.getByTestId('start-search'), { target: { value: '12 Main' } });
    fireEvent.click(await screen.findByTestId('start-retry'));
    expect(await screen.findByText('12 Main St')).toBeTruthy();
    expect((screen.getByTestId('start-search') as HTMLInputElement).value).toBe('12 Main');
  });

  it('resumes the last plan straight into the planner', () => {
    recordRecent({ ogcFid: 7, address: '7 Seventh Ave', zoning: 'RS5', planned: true });
    const o = opened();
    render(<StartPanel />);
    fireEvent.click(screen.getByTestId('start-resume'));
    expect(o.seen[0]).toMatchObject({ ogc_fid: '7', openPlanner: true });
    o.off();
  });

  it('offers no resume and says so when nothing is recent', () => {
    render(<StartPanel />);
    expect(screen.queryByTestId('start-resume')).toBeNull();
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
  });
});

describe('MapUnavailable', () => {
  it('names the next steps and never tells the user to edit a file', () => {
    render(<MapUnavailable />);
    expect(screen.getByText('Map unavailable')).toBeTruthy();
    expect(screen.getByTestId('start-search')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\.env/);
  });
});
