import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommercialCapacityCard } from './CommercialCapacityCard';
import { isNonResidentialOnly, pickDefaultUse } from '../api/designContext';

describe('CommercialCapacityCard (order-8 audit, 2405 12th Ave S)', () => {
  it('states the FAR ceiling in deal language and refuses to offer a residential plan', () => {
    render(
      <CommercialCapacityCard
        zoning="CS"
        uses={['commercial', 'industrial']}
        lotSqft={8622}
        maxFar={0.6}
        maxHeightFt={30}
        maxImperviousPct={90}
        frontSetbackFt={20}
        rearSetbackFt={20}
        allowableGsf={5173}
      />
    );
    const card = screen.getByTestId('commercial-capacity-card').textContent ?? '';
    expect(card).toContain('Commercial lot · CS');
    expect(card).toContain('retail / office and industrial permitted as-of-right');
    expect(card).toContain('5,173 SF');
    expect(card).toContain('FAR 0.6 × 8,622 SF lot');
    expect(card).toContain('height 30 ft');
    expect(card).toContain('Retail massing is not modeled yet');
  });

  it('derives FAR × lot when the context has no entitlement figure', () => {
    render(<CommercialCapacityCard zoning="CL" uses={['commercial']} lotSqft={10000} maxFar={0.6} />);
    expect(screen.getByTestId('commercial-capacity-card').textContent).toContain('6,000 SF');
  });

  it('is the routing target for non-residential-only parcels', () => {
    expect(isNonResidentialOnly(['commercial', 'industrial'])).toBe(true);
    expect(isNonResidentialOnly(['commercial', 'single_family'])).toBe(false);
    expect(isNonResidentialOnly([])).toBe(false);
    expect(pickDefaultUse(['commercial', 'industrial'])).toBeNull();
  });
});
