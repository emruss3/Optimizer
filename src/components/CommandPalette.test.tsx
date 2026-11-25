import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const lookupMock = vi.fn();
const rpcMock = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, ...args: unknown[]) => fn === 'find_planner_parcels' ? lookupMock(fn, ...args) : rpcMock(fn, ...args),
  },
}));

import CommandPalette from './CommandPalette';

// Headless UI measures the dialog; jsdom has no ResizeObserver
class RO { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

/** A PostgREST RPC builder that resolves to the given rows. */
function lookup(result: { data: unknown; error: unknown }, delayMs = 0) {
  return { abortSignal: () => new Promise(res => setTimeout(() => res(result), delayMs)) };
}

/** the first option, by keyboard (the parcels lead the list) */
function pickFirst() {
  const opt = screen.getAllByRole('option')[0];
  fireEvent.pointerDown(opt, { button: 0 });
  fireEvent.mouseDown(opt, { button: 0 });
  fireEvent.mouseUp(opt, { button: 0 });
  fireEvent.click(opt, { button: 0 });
}

const ROW = {
  ogc_fid: 680339, parcelnumb: '05900002900', address: '0 WHITES CREEK PIKE', zoning: 'RM9', landval: 191300,
  geometry: { type: 'MultiPolygon', coordinates: [[[[-86.8, 36.2], [-86.79, 36.2], [-86.79, 36.21], [-86.8, 36.2]]]] },
  deeded_acres: 5.9, max_far: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* jsdom */ }
});

describe('CommandPalette — a search hit opens the parcel the way a map click does (the scope\'s P0.3, 2026-11-09)', () => {
  it('fetches the full row and dispatches openParcelDrawer with it; the palette closes after', async () => {
    lookupMock.mockImplementation(() => lookup({ data: [ROW], error: null }));
    rpcMock.mockResolvedValue({ data: [ROW], error: null });
    const onClose = vi.fn();
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    document.addEventListener('openParcelDrawer', listener);

    render(<CommandPalette isOpen onClose={onClose} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'whites creek' } });
    await screen.findByText('0 WHITES CREEK PIKE', {}, { timeout: 3000 });
    pickFirst();

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(rpcMock).toHaveBeenCalledWith('get_parcel_by_id', { p_ogc_fid: 680339 });
    const parcel = seen[0] as Record<string, unknown>;
    expect(parcel.ogc_fid).toBe('680339');
    expect(parcel.address).toBe('0 WHITES CREEK PIKE');
    expect(parcel.geometry).toEqual(ROW.geometry);
    expect(onClose).toHaveBeenCalled();
    document.removeEventListener('openParcelDrawer', listener);
  });

  it('a row without geometry does not open the drawer: the failure is said, the palette stays', async () => {
    lookupMock.mockImplementation(() => lookup({ data: [ROW], error: null }));
    rpcMock.mockResolvedValue({ data: [{ ...ROW, geometry: null }], error: null });
    const onClose = vi.fn();
    render(<CommandPalette isOpen onClose={onClose} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'whites creek' } });
    await screen.findByText('0 WHITES CREEK PIKE', {}, { timeout: 3000 });
    pickFirst();
    expect((await screen.findByTestId('palette-open-error')).textContent).toContain('Could not open 0 WHITES CREEK PIKE: the parcel record has no geometry');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('no match and a failed request read differently', async () => {
    lookupMock.mockImplementation(() => lookup({ data: [], error: null }));
    const { rerender } = render(<CommandPalette isOpen onClose={() => undefined} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzzz nowhere' } });
    expect((await screen.findByTestId('palette-no-match', {}, { timeout: 3000 })).textContent).toContain('No parcel matches "zzzz nowhere"');

    lookupMock.mockImplementation(() => lookup({ data: null, error: { message: 'statement timeout' } }));
    rerender(<CommandPalette isOpen onClose={() => undefined} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'brick church' } });
    expect((await screen.findByTestId('palette-search-error', {}, { timeout: 3000 })).textContent).toContain('Parcel search failed: statement timeout');
    expect(screen.queryByTestId('palette-no-match')).toBeNull();
  });

  it('a slow answer for an older query never lands over the newer one', async () => {
    lookupMock.mockImplementation(() => lookup({ data: [{ ...ROW, ogc_fid: 1, address: 'OLD QUERY HIT' }], error: null }, 900));
    render(<CommandPalette isOpen onClose={() => undefined} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old query' } });
    await act(async () => { await new Promise(r => setTimeout(r, 400)); }); // the debounce fires, the slow request is in flight
    lookupMock.mockImplementation(() => lookup({ data: [{ ...ROW, ogc_fid: 2, address: 'NEW QUERY HIT' }], error: null }, 50));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'new query' } });
    await screen.findByText('NEW QUERY HIT', {}, { timeout: 3000 });
    await act(async () => { await new Promise(r => setTimeout(r, 900)); }); // the old answer arrives late
    expect(screen.queryByText('OLD QUERY HIT')).toBeNull();
    expect(screen.getByText('NEW QUERY HIT')).toBeTruthy();
  });
});

describe('CommandPalette — assessor parcel number lookup', () => {
  it('preserves the typed APN formatting for the shared lookup', async () => {
    lookupMock.mockImplementation(() => lookup({ data: [{ ...ROW, parcelnumb: '116 02 0 020.00' }], error: null }));
    render(<CommandPalette isOpen onClose={() => undefined} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '116 02 0 020.00' } });
    await screen.findByText('0 WHITES CREEK PIKE', {}, { timeout: 3000 });
    expect(lookupMock).toHaveBeenCalledWith('find_planner_parcels', { p_query: '116 02 0 020.00', p_limit: 10 });
  });
});
