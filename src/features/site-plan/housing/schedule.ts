/**
 * The homes on the plan, by lot and by design (masterplan audit 2026-11-26: the
 * drawings, schedule and quantities must describe the same revision). Read off
 * the plan's own house elements, so it changes with every home change, undo,
 * redo, re-solve and reopened save.
 */
import type { Element } from '../../../engine/types';
import { housingDesignById } from './catalogue';
import { detachedHouses, parentLotOf } from './eligibility';
import { HOME_DESIGNS } from './originalDesigns';

export interface HomeRow { houseId: string; lot: string; design: string; kind: 'stock' | 'concept' | 'engine'; beds: number | null; footprintSf: number | null }
export interface DesignTotal { design: string; kind: HomeRow['kind']; homes: number; lots: string[]; footprintSf: number }

export function homesSchedule(elements: Element[]): { rows: HomeRow[]; totals: DesignTotal[] } {
  const rows: HomeRow[] = detachedHouses(elements).map(h => {
    const p = h.properties ?? {};
    const id = typeof p.housingDesignId === 'string' && p.housingPlacementStatus === 'placed' ? p.housingDesignId : null;
    const concept = id ? HOME_DESIGNS.find(d => d.id === id) : undefined;
    const stock = id && !concept ? housingDesignById(id) : undefined;
    const design = concept ? `${concept.name} (concept)` : stock ? stock.planNumber : typeof p.housePlan === 'string' ? `${p.housePlan} (engine)` : 'generic pad (engine)';
    const kind: HomeRow['kind'] = concept ? 'concept' : stock ? 'stock' : 'engine';
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
    return { houseId: h.id, lot: parentLotOf(h, elements)?.name ?? h.name ?? h.id, design, kind, beds: num(p.houseBeds), footprintSf: num(p.houseFootprintSf) };
  });
  const order = (s: string) => Number(/(\d+)/.exec(s)?.[1] ?? 0);
  rows.sort((a, b) => order(a.lot) - order(b.lot));
  const by = new Map<string, DesignTotal>();
  for (const r of rows) {
    const t = by.get(r.design) ?? { design: r.design, kind: r.kind, homes: 0, lots: [], footprintSf: 0 };
    t.homes += 1; t.lots.push(r.lot); t.footprintSf += r.footprintSf ?? 0;
    by.set(r.design, t);
  }
  return { rows, totals: [...by.values()] };
}
