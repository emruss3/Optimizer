/**
 * Mt View audit 7572158 · first patch: restore the missing guest-parking fact
 * through the shared path (panel → compare → Letter / slide / tabloid).
 *
 * Formatter-only coverage is insufficient: this suite reads 0/8 · 8 short ·
 * engine target in the layout panel, the comparison table, and the print
 * document; keeps 42/42 on the apartment option; recovers the guest fact after
 * A→B→A; and carries the recorded mews 2/7.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { layoutDecisionFacts, resolveExhibitProduct, scheduleForProduct } from './exhibitSchedule';
import { compareLayouts, retainLayoutFacts, type LayoutOption } from './layoutCompare';
import { isDetachedSfPlanElement, isSfPlanElement } from './generateSfPlan';
import { LayoutChoicePanel } from '../ui/LayoutChoicePanel';
import { renderSitePlanSheet } from '../scene/sheetSvg';
import { buildDrawingScene } from '../scene/buildScene';
import type { Element } from '../../../engine/types';
import type { Polygon } from 'geojson';
import { geom2274To4326 } from '../../../utils/tnStatePlane';
import { feature4326To3857 } from '../../../utils/reproject';

vi.mock('../../../lib/supabase', () => ({ supabase: null }));

const X0 = 1_731_047.065, Y0 = 669_334.005;
const sq = (x: number, y: number, w: number, d: number): Polygon =>
  feature4326To3857(geom2274To4326({
    type: 'Polygon',
    coordinates: [[[X0 + x, Y0 + y], [X0 + x + w, Y0 + y], [X0 + x + w, Y0 + y + d], [X0 + x, Y0 + y + d], [X0 + x, Y0 + y]]],
  } as never) as never) as Polygon;

const el = (id: string, type: Element['type'], geometry: Polygon, properties: Record<string, unknown> = {}): Element => ({
  id, type, name: id, geometry,
  properties: properties as Element['properties'],
  metadata: { createdAt: '', updatedAt: '', source: 'ai-generated' },
});

const thElements: Element[] = [
  el('thv3-home-1', 'building', sq(0, 60, 40, 40), { floors: 3 }),
  el('thv3-guest-1', 'parking', sq(0, 0, 40, 18), { stalls: 0 }),
];

const mtViewTown = layoutDecisionFacts({
  product: {
    product: 'townhome',
    guestStalls: 0,
    guestTarget: 8,
    guestGraded: false,
    revision: 'dca61670',
  },
  maxGsf: 49_600,
});

const mtViewApt = layoutDecisionFacts({
  product: {
    product: 'apartment',
    input: { stallsDrawn: 42, stallsRequired: 42, builtGsf: 43_203 },
    revision: 'rev-mf',
  },
  builtGsf: 43_203,
});

const mews = layoutDecisionFacts({
  product: {
    product: 'townhome',
    guestStalls: 2,
    guestTarget: 7,
    guestGraded: false,
    revision: 'mews-rev',
  },
  maxGsf: 40_000,
});

const choice = {
  multifamilyHomes: 24,
  multifamilyProduct: 'apartments' as const,
  densityCap: 32,
  defaultKind: 'neighborhood' as const,
  sentence: 'The neighborhood places more homes here.',
  floodHold: false,
  neighborhood: { homes: 30, requested: 'townhome', label: 'townhomes (lane)', buildable: true, drawable: true },
};

describe('Mt View guest parking through panel, compare, and print', () => {
  it('does not treat thv3 as the detached SF schedule product', () => {
    expect(thElements.every(isSfPlanElement)).toBe(true);
    expect(thElements.some(isDetachedSfPlanElement)).toBe(false);
    // Old short-circuit: seedViewOn || sfPlanOnSheet (with thv3 in isSfPlanElement) emptied the schedule.
    const wouldHaveSuppressed = thElements.some(isSfPlanElement);
    expect(wouldHaveSuppressed).toBe(true);
    const product = resolveExhibitProduct({
      townhomeOnSheet: true,
      guestStalls: 0,
      guestTarget: 8,
      guestGraded: false,
      detachedSfOnSheet: thElements.some(isDetachedSfPlanElement),
      revision: 'dca61670',
    });
    expect(product.product).toBe('townhome');
    expect(scheduleForProduct(product)[0]?.value).toMatch(/0 of 8.*8 short.*target of the engine/);
  });

  it('panel shows 0/8 · 8 short · engine target for the townhome on the sheet', () => {
    render(
      <LayoutChoicePanel
        choice={choice as never}
        competition={null}
        shown="neighborhood"
        shownRequested="townhome"
        auto={false}
        onChoose={() => {}}
        onViewCandidate={() => {}}
        shownFacts={{
          parking: mtViewTown.parking,
          floorArea: mtViewTown.floorArea,
          guestSupply: mtViewTown.guestSupply,
          guestTarget: mtViewTown.guestTarget,
          guestBasis: mtViewTown.guestBasis,
        }}
        factsRevision={mtViewTown.revision}
        thV3={{
          status: 'done', reason: null, homes: 30, pattern: 'lane', zoning: 'RM15',
          siteAcres: 2, heldAcres: null, homesPerAcre: 15, streetFt: 0, alleys: 1, greens: 1,
          usableOpenPct: 40, guestStalls: 0, guestTarget: 8, stormwaterSf: null, stormwaterNeededSf: null,
          unitWFt: 20, unitDFt: 40, heldOutAcres: null, densityCap: 32, overDensityBy: null,
          homesBeforeDensityCap: null, trimNote: null, tests: [], requiredFails: [], contextFlags: [],
          notes: [], generatorVersion: 'th_v3', basisLine: '',
        }}
      />,
    );
    const guest = screen.getByTestId('layout-thv3-guest');
    expect(guest.textContent).toMatch(/0 of 8/);
    expect(guest.textContent).toMatch(/8 short/);
    expect(guest.textContent).toMatch(/target of the engine/);
    fireEvent.click(screen.getByTestId('layout-compare'));
    const parking = document.querySelector('[data-compare-row="Parking"]');
    expect(parking?.textContent).toMatch(/Guest parking 0 of 8/);
    expect(parking?.textContent).toMatch(/8 short/);
    expect(parking?.textContent).toMatch(/target of the engine/);
  });

  it('compare keeps 42/42 on apartments and recovers 0/8 after A→B→A', () => {
    const { rerender } = render(
      <LayoutChoicePanel
        choice={choice as never}
        competition={null}
        shown="neighborhood"
        shownRequested="townhome"
        auto={false}
        onChoose={() => {}}
        onViewCandidate={() => {}}
        shownFacts={{
          parking: mtViewTown.parking,
          floorArea: mtViewTown.floorArea,
          guestSupply: mtViewTown.guestSupply,
          guestTarget: mtViewTown.guestTarget,
          guestBasis: mtViewTown.guestBasis,
        }}
        factsRevision="dca61670"
      />,
    );
    rerender(
      <LayoutChoicePanel
        choice={choice as never}
        competition={null}
        shown="multifamily"
        shownRequested={null}
        auto={false}
        onChoose={() => {}}
        onViewCandidate={() => {}}
        shownFacts={{ parking: mtViewApt.parking, floorArea: mtViewApt.floorArea }}
        factsRevision="rev-mf"
      />,
    );
    rerender(
      <LayoutChoicePanel
        choice={choice as never}
        competition={null}
        shown="neighborhood"
        shownRequested="townhome"
        auto={false}
        onChoose={() => {}}
        onViewCandidate={() => {}}
        shownFacts={{
          parking: mtViewTown.parking,
          floorArea: mtViewTown.floorArea,
          guestSupply: mtViewTown.guestSupply,
          guestTarget: mtViewTown.guestTarget,
          guestBasis: mtViewTown.guestBasis,
        }}
        factsRevision="dca61670"
      />,
    );
    fireEvent.click(screen.getByTestId('layout-compare'));
    const parking = document.querySelector('[data-compare-row="Parking"]');
    expect(parking?.textContent).toMatch(/Guest parking 0 of 8 stalls · 8 short · a target of the engine/);
    expect(parking?.textContent).toMatch(/42 drawn · 42 required/);
    // Structured retain path agrees with the table.
    let kept = retainLayoutFacts({}, 'neighborhood', {
      parking: mtViewTown.parking,
      floorArea: mtViewTown.floorArea,
      guestSupply: 0,
      guestTarget: 8,
      guestBasis: 'engine-target',
    }, 'dca61670');
    kept = retainLayoutFacts(kept, 'multifamily', { parking: mtViewApt.parking, floorArea: mtViewApt.floorArea }, 'rev-mf');
    kept = retainLayoutFacts(kept, 'neighborhood', {
      parking: mtViewTown.parking,
      floorArea: mtViewTown.floorArea,
      guestSupply: 0,
      guestTarget: 8,
      guestBasis: 'engine-target',
    }, 'dca61670');
    expect(kept.neighborhood?.guestSupply).toBe(0);
    expect(kept.neighborhood?.guestTarget).toBe(8);
    expect(kept.neighborhood?.guestBasis).toBe('engine-target');
    expect(kept.multifamily?.parking).toBe('42 drawn · 42 required');
  });

  it('Letter, slide and tabloid print 0/8 · 8 short · engine target', () => {
    const scene = buildDrawingScene({
      parcelId: '660125',
      schemeId: 'neighborhood:townhome',
      elements: thElements,
      parcelGeometry: sq(-40, -40, 400, 300),
      schedule: null,
      generator: 'th_v3',
    });
    expect(scene).not.toBeNull();
    const title = {
      project: '5525 Mt View Rd',
      subtitle: 'RM15 · townhomes',
      date: '2026-11-23',
      decision: mtViewTown.rows,
      data: [{ label: 'Zoning', value: 'RM15' }],
    };
    for (const size of ['letter', 'slide', 'tabloid'] as const) {
      const sheet = renderSitePlanSheet(scene!, title, size);
      const doc = new DOMParser().parseFromString(sheet.svg, 'image/svg+xml');
      expect(doc.querySelector('parsererror')).toBeNull();
      const parking = doc.querySelector('[data-decision="Parking"]');
      expect(parking?.textContent).toMatch(/0 of 8/);
      expect(parking?.textContent).toMatch(/8 short/);
      expect(parking?.textContent).toMatch(/target of the\s*engine/); // sheetSvg wrap may join tspans
    }
  });

  it('recorded mews case carries its own 2/7 on compare and print', () => {
    const town: LayoutOption = {
      key: 'neighborhood', label: '27 townhomes (mews)', homes: 27, shown: true,
      parking: mews.parking, floorArea: mews.floorArea,
      guestSupply: mews.guestSupply, guestTarget: mews.guestTarget, guestBasis: mews.guestBasis,
    };
    const apts: LayoutOption = {
      key: 'multifamily', label: '24 apartments', homes: 24, shown: false,
      parking: '42 drawn · 42 required', floorArea: '43,203 GSF',
    };
    const c = compareLayouts(town, apts, null);
    expect(c.rows.find(r => r.label === 'Parking')?.a).toMatch(/Guest parking 2 of 7/);
    expect(c.rows.find(r => r.label === 'Parking')?.a).not.toMatch(/0 of 8/);
    expect(c.rows.find(r => r.label === 'Parking')?.b).toBe('42 drawn · 42 required');

    const scene = buildDrawingScene({
      parcelId: 'mews',
      schemeId: 'neighborhood:townhome',
      elements: thElements,
      parcelGeometry: sq(-40, -40, 400, 300),
      schedule: null,
      generator: 'th_v3',
    });
    for (const size of ['letter', 'slide', 'tabloid'] as const) {
      const doc = new DOMParser().parseFromString(
        renderSitePlanSheet(scene!, { project: 'Mews', date: 'd', decision: mews.rows }, size).svg,
        'image/svg+xml',
      );
      expect(doc.querySelector('[data-decision="Parking"]')?.textContent).toMatch(/2 of 7/);
    }
  });

  it('missing guest supply and a true zero target stay distinct from a multifamily total', () => {
    const missing = layoutDecisionFacts({
      product: { product: 'townhome', guestStalls: null, guestTarget: 8, guestGraded: false },
    });
    expect(missing.parking).toBeNull();
    expect(missing.guestSupply).toBeNull();
    expect(missing.guestTarget).toBe(8);
    expect(missing.rows).toEqual([]);

    const zeroTarget = layoutDecisionFacts({
      product: { product: 'townhome', guestStalls: 0, guestTarget: 0, guestGraded: false },
    });
    expect(zeroTarget.parking).toBe('Guest parking 0 of 0 stalls · a target of the engine, not one of its tests');
    expect(zeroTarget.guestSupply).toBe(0);
    expect(zeroTarget.guestTarget).toBe(0);
    // A generic stallsDrawn must not substitute for the guest target.
    const wronglyGeneric = scheduleForProduct({
      product: 'townhome',
      guestStalls: 0,
      guestTarget: 8,
      guestGraded: false,
    });
    expect(wronglyGeneric[0]?.value).not.toMatch(/drawn|required|supplied/);
    expect(wronglyGeneric[0]?.value).toMatch(/Guest parking/);
  });
});
