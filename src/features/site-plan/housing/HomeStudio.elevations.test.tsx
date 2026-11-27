import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HomeStudio from './HomeStudio';
import type { HomeDesign } from './originalDesigns';
import { HOME_DESIGNS } from './originalDesigns';

const stockWithoutElevations: HomeDesign = {
  ...HOME_DESIGNS[0]!,
  id: 'abhp:1754-00010',
  name: 'ABHP stock stand-in',
  setting: 'Buildable stock',
};

/** Studio opens on Buildable stock; Elevations live under Concept studies. */
function openConceptElevations() {
  fireEvent.click(screen.getByRole('tab', { name: /Authored catalog/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Elevations' }));
}

describe('HomeStudio Elevations — photoreal vs diagram', () => {
  it('defaults Elevations to Diagram for designs with photoreal assets', () => {
    const withAssets = HOME_DESIGNS.find((h) => h.id === 'tn-court-cottage-v1')!;
    render(
      <HomeStudio
        elements={[]}
        designs={[withAssets]}
        stockPlans={[]}
        onClose={() => undefined}
        onPreview={() => undefined}
      />,
    );
    openConceptElevations();
    expect(screen.getByTestId('home-elevation-diagram')).toBeTruthy();
    expect(screen.queryByTestId('home-elevation-photo')).toBeNull();
    expect(screen.getByTestId('home-elevation-photoreal')).toBeTruthy();
  });

  it('shows Photoreal when opted in for a design that has elevation assets', () => {
    const withAssets = HOME_DESIGNS.find((h) => h.id === 'tn-court-cottage-v1')!;
    render(
      <HomeStudio
        elements={[]}
        designs={[withAssets]}
        stockPlans={[]}
        onClose={() => undefined}
        onPreview={() => undefined}
      />,
    );
    openConceptElevations();
    fireEvent.click(screen.getByTestId('home-elevation-photoreal'));
    expect(screen.getByTestId('home-elevation-photo')).toBeTruthy();
    const img = screen.getByTestId('home-elevation-photo').querySelector('img');
    expect(img?.getAttribute('src')).toBe(
      '/home-designs/tn-court-cottage-v1-elevation-front-v2.webp',
    );
  });

  it('falls back to Diagram and hides Photoreal when elevation assets are missing', () => {
    render(
      <HomeStudio
        elements={[]}
        designs={[stockWithoutElevations]}
        stockPlans={[]}
        onClose={() => undefined}
        onPreview={() => undefined}
      />,
    );
    openConceptElevations();
    expect(screen.getByTestId('home-elevation-diagram')).toBeTruthy();
    expect(screen.queryByTestId('home-elevation-photoreal')).toBeNull();
    expect(screen.queryByTestId('home-elevation-photo')).toBeNull();
  });

  it('onError on a photoreal image falls back to Diagram', () => {
    const withAssets = HOME_DESIGNS.find((h) => h.id === 'tn-court-cottage-v1')!;
    render(
      <HomeStudio
        elements={[]}
        designs={[withAssets]}
        stockPlans={[]}
        onClose={() => undefined}
        onPreview={() => undefined}
      />,
    );
    openConceptElevations();
    fireEvent.click(screen.getByTestId('home-elevation-photoreal'));
    const img = screen.getByTestId('home-elevation-photo').querySelector('img')!;
    fireEvent.error(img);
    expect(screen.getByTestId('home-elevation-diagram')).toBeTruthy();
    expect(screen.queryByTestId('home-elevation-photo')).toBeNull();
  });
});
