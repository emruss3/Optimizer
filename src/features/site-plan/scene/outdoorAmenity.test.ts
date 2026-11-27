import { describe, expect, it } from 'vitest';
import { isOutdoorAmenityName } from './outdoorAmenity';

describe('isOutdoorAmenityName', () => {
  it('flags pool decks and open decks as outdoor', () => {
    expect(isOutdoorAmenityName('Pool deck')).toBe(true);
    expect(isOutdoorAmenityName('Pool')).toBe(true);
    expect(isOutdoorAmenityName('Outdoor deck')).toBe(true);
    expect(isOutdoorAmenityName('Open deck')).toBe(true);
  });

  it('keeps enclosed amenity buildings enclosed', () => {
    expect(isOutdoorAmenityName('Clubhouse')).toBe(false);
    expect(isOutdoorAmenityName('Amenity building')).toBe(false);
    expect(isOutdoorAmenityName('Fitness')).toBe(false);
    expect(isOutdoorAmenityName(null)).toBe(false);
  });
});
