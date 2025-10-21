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

