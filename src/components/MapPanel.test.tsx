import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MapPanel from './MapPanel';

const { initMap, searchParcels } = vi.hoisted(() => ({
  initMap: vi.fn(),
  searchParcels: vi.fn(),
}));

vi.mock('./Map', () => ({
  // MapView initializes Mapbox in a mount effect, not during render.
  default: function TestMap() {
    React.useEffect(() => { initMap(); }, []);
    return <div data-testid="healthy-map" />;
  },
}));
vi.mock('../lib/parcelSearch', async original => ({
  ...(await original<typeof import('../lib/parcelSearch')>()),
  searchParcels,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  initMap.mockReset();
  searchParcels.mockReset();
  vi.restoreAllMocks();
});

it('keeps the search and surrounding workspace mounted after WebGL setup fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initMap.mockImplementation(() => { throw new Error('Failed to initialize WebGL'); });
  searchParcels.mockResolvedValue([{ ogcFid: 681001, address: '0 McMurray Cir', parcelNumber: '147160A90000CO', zoning: 'RM15' }]);
  const onOpen = vi.fn();
  document.addEventListener('openParcelDrawer', onOpen);
  try {
    render(<><button>Workspace action</button><MapPanel onParcelClick={vi.fn()} /></>);

    expect(await screen.findByTestId('map-unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Workspace action' })).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();

    const search = screen.getByTestId('start-search');
    for (const query of ['0 McMurray Cir', '147160A90000CO']) {
      fireEvent.change(search, { target: { value: query } });
      fireEvent.click(await screen.findByRole('button', { name: /0 McMurray Cir/ }));
      expect(searchParcels).toHaveBeenLastCalledWith(query, 10, expect.any(AbortSignal));
      expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({
        detail: expect.objectContaining({ ogc_fid: '681001' }),
      }));
    }
    expect(onOpen).toHaveBeenCalledTimes(2);
  } finally {
    document.removeEventListener('openParcelDrawer', onOpen);
  }
});

it('preserves the normal map when initialization succeeds', async () => {
  render(<MapPanel onParcelClick={vi.fn()} />);
  expect(await screen.findByTestId('healthy-map')).toBeTruthy();
  expect(screen.queryByTestId('map-unavailable')).toBeNull();
});
