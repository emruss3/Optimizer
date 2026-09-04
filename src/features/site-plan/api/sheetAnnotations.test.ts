import { describe, it, expect } from 'vitest';
import type { Element } from '../../../engine/types';
import { TopoGrid, type ParcelTopo } from './parcelTopo';
import { buildSheetAnnotations, buildSheetTitleBlock } from './sheetAnnotations';

const X = 1726000, Y = 672500;
const meta = { createdAt: 't', updatedAt: 't', source: 'ai-generated' as const };
const square = { type: 'Polygon' as const, coordinates: [[[0, 0], [30, 0], [30, 10], [0, 10], [0, 0]]] };

// a flat 40 × 3 grid at 20 ft along the street, 1 ft of fall per 100 ft east
const samples: Array<[number, number, number]> = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 40; c++) samples.push([c, r, 440 - c * 0.2]);
const TOPO: ParcelTopo = {
  parcel_ogc_fid: 1, spacing_ft: 20, grid: { origin_x: X, origin_y: Y + 20, cols: 40, rows: 3, spacing_ft: 20 }, contours: [], samples,
};

const street: Element = {
  id: 'subdiv-street-1', type: 'circulation', name: 'Street A', geometry: square, metadata: meta,
  properties: { kind: 'through', widthFt: 55, centerline2274: [[X, Y], [X + 350, Y]] },
} as Element;
const bulb: Element = {
  id: 'subdiv-street-2', type: 'circulation', name: 'Cul-de-sac 1', geometry: square, metadata: meta, properties: { kind: 'cul_de_sac' },
} as Element;
const alley: Element = {
  id: 'subdiv-alley-1', type: 'circulation', name: 'Alley', geometry: square, metadata: meta, properties: { kind: 'alley', widthFt: 20, areaSqFt: 9000 },
} as Element;

describe('buildSheetAnnotations — what the layout sheet writes on the plan', () => {
  it('stations every 100 ft and the end, existing grade every 200 ft and at both ends, the R.O.W. label mid-street', () => {
    const ann = buildSheetAnnotations([street, bulb, alley], new TopoGrid(TOPO));
    const stations = ann.filter(a => a.kind === 'station').map(a => a.text);
    expect(stations).toEqual(['0+00', '1+00', '2+00', '3+00', '3+50']);
    // ticks from zoom 0.5, their text only from zoom 1 (100 ft ≈ 30 px there); grades from 1.2
    const s0 = ann.find(a => a.kind === 'station')!;
    expect([s0.minZoom, s0.labelMinZoom]).toEqual([0.5, 1.0]);
    expect(ann.find(a => a.kind === 'spot')?.minZoom).toBe(1.2);
    const spots = ann.filter(a => a.kind === 'spot').map(a => a.text);
    expect(spots).toEqual(['EG 440.0', 'EG 438.0', 'EG 436.5']);
    const label = ann.find(a => a.kind === 'label' && a.text.startsWith('STREET A'));
    expect(label?.text).toBe("STREET A · 55' PUBLIC R.O.W.");
    expect(typeof label?.angle).toBe('number');
    expect(ann.find(a => a.kind === 'radius')?.text).toBe("R = 50'");
    expect(ann.find(a => a.kind === 'label' && a.text.endsWith('ALLEY'))?.text).toBe("20' ALLEY");
    // canvas frame: Nashville in web-mercator metres
    expect(ann[0].x).toBeLessThan(-9_600_000);
  });

  it('writes stations but no grades without topography, and nothing for a stub of a street', () => {
    const ann = buildSheetAnnotations([street], null);
    expect(ann.filter(a => a.kind === 'spot')).toHaveLength(0);
    expect(ann.filter(a => a.kind === 'station')).toHaveLength(5);
    const stub = { ...street, properties: { ...street.properties, centerline2274: [[X, Y], [X + 30, Y]] } } as Element;
    expect(buildSheetAnnotations([stub], null)).toEqual([]);
  });

  it('keeps the R.O.W. label between station ticks, not on one', () => {
    const long = { ...street, properties: { ...street.properties, centerline2274: [[X, Y], [X + 800, Y]] } } as Element;
    const ann = buildSheetAnnotations([long], null);
    const label = ann.find(a => a.kind === 'label')!;
    const s400 = ann.find(a => a.kind === 'station' && a.text === '4+00')!;
    // 50 ft (≈15 m in the canvas frame) off the 4+00 tick
    expect(Math.abs(label.x - s400.x)).toBeGreaterThan(12);
  });
});

describe('buildSheetTitleBlock — what the sheet says about itself', () => {
  const topo = { source: 'USGS 3DEP 1 m DEM', spacingFt: 20, zMinFt: 406.6, zMaxFt: 444.6, meanSlopePct: 5.4, maxSlopePct: 31.8 };
  const date = new Date(2026, 8, 4);

  it('names a subdivision a concept layout plan and states every basis', () => {
    const tb = buildSheetTitleBlock({
      address: '2400 W Heiman St', zoning: 'R6', acres: 13.15, hasPlan: false, topo, date,
      subdivision: { lots: 34, network: 'spine', pctRow: 20, pctHazard: 24.7, hazardCoverage: 'ingested', crossingFt: 102 },
    });
    expect(tb.project).toBe('2400 W Heiman St');
    expect(tb.title).toBe('CONCEPT LAYOUT PLAN');
    expect(tb.subtitle).toBe('R6 · 13.2 ac · 34 lots · spine network · 20% R.O.W.');
    expect(tb.notes[0]).toBe('Contours: USGS 3DEP 1 m DEM · 1-ft interval (index 5 ft) · NAVD88 · 20-ft grid');
    expect(tb.notes[1]).toBe('Elev 406.6–444.6 ft · mean slope 5.4% (max 31.8%)');
    expect(tb.notes[2]).toContain('FEMA NFHL SFHA');
    expect(tb.notes[2]).toContain('24.7% held out');
    expect(tb.notes[3]).toContain('102-ft crossing of held-out land');
    expect(tb.notes[4]).toContain('not a survey');
    expect(tb.date).toBe('2026-09-04');
    // one short line each — the block sits on the canvas
    for (const n of tb.notes) expect(n.length).toBeLessThan(110);
  });

  it('shortens the long service source to its name', () => {
    const tb = buildSheetTitleBlock({
      address: 'x', hasPlan: false, date,
      topo: { ...topo, source: 'USGS 3DEP 1 m DEM (elevation.nationalmap.gov, getSamples), NAVD88 feet' },
    });
    expect(tb.notes[0].startsWith('Contours: USGS 3DEP 1 m DEM · 1-ft')).toBe(true);
  });

  it('says when the DEM was not reached and names a massing plan a site plan', () => {
    const tb = buildSheetTitleBlock({ address: '2600 W Heiman St', zoning: 'RM40', acres: 0.62, hasPlan: true, topo: null, date });
    expect(tb.title).toBe('CONCEPT SITE PLAN');
    expect(tb.subtitle).toBe('RM40 · 0.62 ac');
    expect(tb.notes[0]).toContain('not available');
    expect(tb.notes[1]).toContain('Concept massing from the parcel record');
  });

  it('falls back to the parcel id and reads as existing conditions before a plan', () => {
    const tb = buildSheetTitleBlock({ address: '  ', parcelId: 550510, hasPlan: false, topo, date });
    expect(tb.project).toBe('Parcel 550510');
    expect(tb.title).toBe('EXISTING CONDITIONS');
    expect(tb.subtitle).toBeNull();
  });
});
