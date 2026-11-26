import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HousingDesignPicker } from './HousingDesignPicker';
import { DELK_PARCEL_ID, buildableStockPlans, stockEligibility } from '../housing';
import fixture from '../api/__fixtures__/delk-675423.json';
import { sfV1ToElements, type SfV1Response } from '../api/sfV1Plan';

const rows = () => stockEligibility(buildableStockPlans(), sfV1ToElements(fixture.deep as unknown as SfV1Response).elements);

describe('HousingDesignPicker (stock plans lot by lot)', () => {
  it('counts the plans that fit each lot and says why a lot takes none', () => {
    render(<HousingDesignPicker parcelId={DELK_PARCEL_ID} rows={rows()} onOpen={() => undefined} />);
    const r = rows();
    const withChoice = r.filter(x => x.eligible.length > 0).length;
    expect(screen.getByTestId('housing-fit-summary').textContent).toBe(`${withChoice} of 5 lots can change`);
    const items = screen.getByTestId('housing-lot-counts').querySelectorAll('li');
    expect(items).toHaveLength(5);
    expect(Number(items[0]!.getAttribute('data-eligible'))).toBeGreaterThanOrEqual(2);
    expect(items[0]!.textContent).toMatch(/^Lot 1: \d+ plans fit$/);
  });

  it('says why a lot takes none', () => {
    const r = rows().map((x, i) => (i === 4 ? { ...x, eligible: [], lotProblem: 'irregular or pie lot with no driveway: resolve the frontage edge before placing a stock plan' } : x));
    render(<HousingDesignPicker parcelId={DELK_PARCEL_ID} rows={r} onOpen={() => undefined} />);
    const items = screen.getByTestId('housing-lot-counts').querySelectorAll('li');
    expect(items[4]!.textContent).toMatch(/Lot 5: none fit — irregular or pie lot with no driveway/);
  });

  it('opens the studio instead of applying a plan to every lot', () => {
    const onOpen = vi.fn();
    render(<HousingDesignPicker parcelId={DELK_PARCEL_ID} rows={rows()} onOpen={onOpen} />);
    expect(screen.queryByTestId('housing-design-1754-00010')).toBeNull();
    fireEvent.click(screen.getByTestId('housing-change-home'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
