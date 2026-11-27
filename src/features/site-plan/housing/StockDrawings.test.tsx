import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StockDrawings } from './StockDrawings';
import { DELK_COTTAGE_1754_00010 } from './catalogue';

describe('stock plan drawings from the listing facts', () => {
  it('draws the footprint at the listed size, and the front and side massing', () => {
    render(<StockDrawings plan={DELK_COTTAGE_1754_00010} />);
    const fp = screen.getByTestId('stock-footprint');
    expect(fp.querySelector('svg')?.getAttribute('aria-label')).toBe('Footprint 40′ by 34′-2″');
    expect(screen.getByTestId('stock-massing-front').querySelector('svg')?.getAttribute('aria-label')).toBe('Front massing, 40′ wide, 1 storey');
    expect(screen.getByTestId('stock-massing-side')).toBeTruthy();
    // the entry from the listing is on the front
    expect(screen.getByTestId('stock-massing-front').textContent).toContain('entry from the listing');
  });

  it('says what the drawings are and where the publisher\'s own are', () => {
    render(<StockDrawings plan={DELK_COTTAGE_1754_00010} />);
    const box = screen.getByTestId('stock-drawings');
    expect(box.textContent).toContain('licensed separately');
    expect(box.querySelector('a')?.getAttribute('href')).toBe(DELK_COTTAGE_1754_00010.source.url);
    expect(box.textContent).toContain('room layout is in the publisher');
  });
});
