import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ParcelDrawer from './ParcelDrawer';

describe('ParcelDrawer gate', () => {
  it('does not crash when parcelId is empty/null', () => {
    const { container } = render(
      <ParcelDrawer 
        parcelId={''} 
        buildingGeoJson={null} 
        zoningInputs={{front: 0, side: 0, rear: 0}} 
      />
    );
    expect(container).toBeTruthy();
  });
});


describe('ParcelDrawer project buttons', () => {
  it('keeps the icon an icon and the project action secondary', async () => {
    const { default: Drawer } = await import('./ParcelDrawer');
    const { render: r, screen: sc } = await import('@testing-library/react');
    r(<Drawer parcel={{ ogc_fid: '1', address: '1 First St', zoning: 'RS5', geometry: { type: 'Polygon', coordinates: [] } } as never} isOpen onClose={() => undefined} onCreateProjectFromParcel={() => undefined} />);
    const button = sc.getByText('Create Project from Parcel').closest('button')!;
    expect(button.className).toContain('border-gray-300');
    expect(button.querySelector('svg')?.getAttribute('class')).toContain('w-4 h-4');
    expect(button.querySelector('svg')?.getAttribute('class')).not.toContain('w-full');
  });
});
