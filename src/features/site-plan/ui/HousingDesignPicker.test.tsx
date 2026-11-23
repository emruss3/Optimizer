import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HousingDesignPicker } from './HousingDesignPicker';
import { DELK_COTTAGE_1754_00010, DELK_PARCEL_ID } from '../housing';

describe('HousingDesignPicker', () => {
  it('lists plan identity, heated area, stories, beds/baths, parking and source', () => {
    render(
      <HousingDesignPicker
        parcelId={DELK_PARCEL_ID}
        designs={[DELK_COTTAGE_1754_00010]}
        selectedId={null}
        fits={null}
        onSelect={() => undefined}
      />,
    );
    const btn = screen.getByTestId('housing-design-1754-00010');
    expect(btn.textContent).toMatch(/1,141 sf heated/);
    expect(btn.textContent).toMatch(/1 story/);
    expect(btn.textContent).toMatch(/3 bed · 2 ba/);
    expect(btn.textContent).toMatch(/parking pad \(no garage\)/);
    expect(btn.textContent).toMatch(/America's Best House Plans/);
  });

  it('reports fit and unplaced reasons when selected', () => {
    const onSelect = vi.fn();
    render(
      <HousingDesignPicker
        parcelId={DELK_PARCEL_ID}
        designs={[DELK_COTTAGE_1754_00010]}
        selectedId={DELK_COTTAGE_1754_00010.id}
        fits={[
          { status: 'placed', reason: 'trial cleared setbacks on lot 1 with porch to the lane on the 40-ft face', placement: null },
          { status: 'unplaced', reason: 'lot 5: pie lot — resolve edges from actual frontage', placement: null },
        ]}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByTestId('housing-fit-summary').textContent).toBe('1 placed · 1 open');
    expect(screen.getByTestId('housing-unplaced').textContent).toMatch(/pie lot/);
    fireEvent.click(screen.getByTestId('housing-design-1754-00010'));
    expect(onSelect).toHaveBeenCalledWith(DELK_COTTAGE_1754_00010.id);
  });
});
