import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RefusalCard } from './RefusalCard';
import { isRefusal } from '../api/parcelBuildability';

const base = { parcel_ogc_fid: 1, typology: 'multifamily', bar_depth_required_ft: 67.3 };

describe('RefusalCard (J1 refusal-as-deliverable)', () => {
  it('renders the reason with its numbers and the townhome one-tap when width allows', () => {
    const onSwitch = vi.fn();
    render(
      <RefusalCard
        buildability={{ ...base, verdict: 'unbuildable_depth', reason: '41 ft max width < 67 ft bar', max_inscribed_width_ft: 41, envelope_sqft: 6200 }}
        onSwitchToTownhomes={onSwitch}
      />
    );
    expect(screen.getByTestId('refusal-card').textContent).toContain('41 ft max width < 67 ft bar');
    expect(screen.getByTestId('refusal-card').textContent).toContain('6,200 sf');
    fireEvent.click(screen.getByText('Try townhomes'));
    expect(onSwitch).toHaveBeenCalledOnce();
  });

  it('states the honest no when nothing fits (area refusal)', () => {
    render(
      <RefusalCard
        buildability={{ ...base, verdict: 'unbuildable_area', reason: '0 sqft envelope < min bar footprint', max_inscribed_width_ft: 12, envelope_sqft: 0 }}
      />
    );
    expect(screen.getByTestId('refusal-card').textContent).toContain('the correct answer for this parcel is no');
    expect(screen.queryByText('Try townhomes')).toBeNull();
  });

  it('isRefusal treats buildable_easement_access as NOT a refusal', () => {
    expect(isRefusal({ ...base, verdict: 'buildable_easement_access' })).toBe(false);
    expect(isRefusal({ ...base, verdict: 'unbuildable_depth' })).toBe(true);
  });
});
