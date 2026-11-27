import { useEffect, useMemo, useRef, useState } from 'react';
import type { Element } from '../../../engine/types';
import { HOME_DESIGNS, type Face, type HomeDesign } from './originalDesigns';
import { designBounds, program, roofHeight } from './drawings';
import { exteriorRendering, hasPhotorealElevation, interiorRenderings, photorealElevationSrc } from './elevationAssets';
import { HomePlan, Elevation } from './PlanIllustrations';
import { StockDrawings } from './StockDrawings';
import { PROVISIONAL_PAD } from './starterHomes';
import { parentLotOf } from './eligibility';
import { residentialHomes, type FitResult, type HomePlacement } from './placement';
import { buildableStockPlans } from './catalogue';
import { stepHomeDesignIndex } from './homeDesignsGate';
import { authoredSource, catalogFitRows, compatibleLots, SOURCE_LABEL } from './catalogFit';
import { DEFAULT_HOME_SETBACKS, detachedHouses, houseEligibility, stockEligibility, type HouseLotEligibility } from './eligibility';
import type { HousingDesignRecord } from './types';
import './homeStudio.css';

// My plans (linked to the project) · the authored catalogue · stock listings (handoff 11-27)
type StudioMode = 'mine' | 'catalog' | 'stock';

interface Props {
  siteBoundary?: Element['geometry'] | null;
  maxHeightFt?: number | null;
  elements: Element[];
  selected?: string | null;
  /** The authored catalogue, every design (fit is shown per lot, never used to drop one). */
  designs?: readonly HomeDesign[];
  /** Designs linked to this parcel's project ("My plans"), and the project's name. */
  projectDesignIds?: readonly string[];
  projectName?: string | null;
  /** Buildable publisher stock plans (defaults to the ABHP citation catalogue). */
  stockPlans?: readonly HousingDesignRecord[];
  /** The workspace's eligibility rows for these elements (computed once there); recomputed when absent. */
  stockEligibilityRows?: HouseLotEligibility[];
  /** Setbacks the fit uses (the zoning brief's); a lot's own engine setbacks win. */
  stockSetbacks?: { front: number; side: number; rear: number };
  /** Change the home on one house's lot to this stock plan. */
  onApplyStock?: ((designId: string, houseId: string, lock?: boolean) => void) | undefined;
  /** Apply one stock plan to several lots as one change. */
  onApplyStockMany?: ((designId: string, houseIds: string[]) => void) | undefined;
  /** Commit a concept study on one house's lot (not a preview: it becomes the plan). */
  onApplyConcept?: ((designId: string, houseId: string) => void) | undefined;
  onClose: () => void;
  onPreview: (placement: HomePlacement) => void;
  preview?: HomePlacement | null;
  onCancelPreview?: () => void;
  onTargetLot?: (houseId: string) => void;
}

/** Feet for a label: at most two decimals (34.1666… → 34.17, 40 → 40). */
const ft2 = (v: number): string => (Number.isFinite(v) ? Number(v.toFixed(2)).toString() : String(v));

const TITLES: Record<StudioMode, string> = { mine: 'My plans', catalog: 'Authored catalog', stock: 'Stock plans' };

function bathsLabel(baths: number | null): string {
  return baths == null ? 'baths unknown' : `${baths} ba`;
}

function parkingLabel(p: HousingDesignRecord['parking']): string {
  switch (p) {
    case 'attached-garage':
      return 'attached garage';
    case 'detached-garage':
      return 'detached garage';
    case 'pad':
      return 'parking pad (no garage)';
    case 'street':
      return 'street parking';
    case 'alley':
      return 'alley parking';
    case 'none':
      return 'no on-lot parking';
    default:
      return 'parking unknown';
  }
}

function verificationLabel(v: HousingDesignRecord['verification']): string {
  switch (v) {
    case 'trial-cleared':
      return 'Trial-cleared on Delk';
    case 'verified':
      return 'Verified';
    case 'provisional':
      return 'Listing facts · provisional fit';
    default:
      return 'Unverified';
  }
}

export default function HomeStudio({
  elements,
  selected,
  onClose,
  onPreview,
  preview,
  onCancelPreview,
  onTargetLot,
  siteBoundary,
  maxHeightFt,
  designs = HOME_DESIGNS,
  stockPlans,
  stockSetbacks = DEFAULT_HOME_SETBACKS,
  stockEligibilityRows,
  onApplyStock,
  onApplyStockMany,
  onApplyConcept,
  projectDesignIds = [],
  projectName = null,
}: Props) {
  // Explicit empty list means “no SF stock for this session” (MF/CS) — do not
  // fall back to the full catalogue and offer Apply on apartment land.
  const stockAll = useMemo(
    () => (stockPlans !== undefined ? [...stockPlans] : buildableStockPlans()),
    [stockPlans],
  );
  const houses = useMemo(() => residentialHomes(elements), [elements]);
  // a project with its own plans opens on them; otherwise the authored catalogue
  const [mode, setMode] = useState<StudioMode>(() => (projectDesignIds.length ? 'mine' : 'catalog'));
  const [stockIndex, setStockIndex] = useState(0);
  const [choiceId, setChoiceId] = useState<string | null>(null),
    [level, setLevel] = useState(0),
    [view, setView] = useState<'Exterior' | 'Plans' | 'Elevations' | 'Interiors'>('Exterior');
  const [side, setSide] = useState<Face>('front'),
    // Diagram is the plan-derived default; Photoreal is an opt-in character view.
    [elevationMode, setElevationMode] = useState<'photo' | 'diagram'>('diagram'),
    [houseId, setHouseId] = useState(() => houses.find((e) => e.id === selected)?.id ?? houses[0]?.id ?? '');
  const root = useRef<HTMLElement>(null);
  // the lots a design fits, found when asked ("Find compatible lots")
  const [compatible, setCompatible] = useState<{ designId: string; lots: Array<{ id: string; name: string }> } | null>(null);

  // Keep the selected lot when the sheet refreshes; fall back to the first house.
  useEffect(() => {
    if (!houses.length) {
      setHouseId('');
      return;
    }
    if (!houses.some((h) => h.id === houseId)) {
      setHouseId(houses.find((e) => e.id === selected)?.id ?? houses[0]!.id);
    }
  }, [houses, houseId, selected]);

  // the studio follows the house selected on the plan (2D or 3D) while it is open
  useEffect(() => {
    if (selected && houses.some((h) => h.id === selected)) setHouseId(selected);
  }, [selected, houses]);

  const selectedHouse = houses.find((e) => e.id === houseId);
  const currentDesignId = selectedHouse?.properties.housingDesignId;
  const currentAuthored = typeof currentDesignId === 'string' ? designs.find(d => d.id === currentDesignId) : undefined;
  const targetLabel = (selectedHouse && parentLotOf(selectedHouse, elements)?.name) ?? selectedHouse?.name;



  // Every design in the list, fitted to the target lot: fits first, the others with their reason.
  // This one result drives the list, the reason, Preview and Apply (handoff 11-27).
  const listDesigns = useMemo(
    () => (mode === 'mine' ? designs.filter((d) => projectDesignIds.includes(d.id)) : [...designs]),
    [mode, designs, projectDesignIds],
  );
  const rows = useMemo(
    () => catalogFitRows(listDesigns, selectedHouse, elements, siteBoundary, maxHeightFt),
    [listDesigns, selectedHouse, elements, siteBoundary, maxHeightFt],
  );
  const catalogue = useMemo(() => rows.map((r) => r.design), [rows]);
  const fitsHere = rows.filter((r) => r.status === 'fits').length;
  const emptyEligible = catalogue.length === 0;

  // Buildable stock for the selected lot: the shared eligibility result, so
  // the list, the preview and Change home all agree (stock is detached only).
  const stockHouses = useMemo(() => detachedHouses(elements), [elements]);
  const stockRows = useMemo(
    () => stockEligibilityRows ?? (stockAll.length ? stockEligibility(stockAll, elements, stockSetbacks) : []),
    [stockEligibilityRows, stockAll, elements, stockSetbacks],
  );
  const stockRow = useMemo(
    () => {
      const h = stockHouses.find((x) => x.id === houseId);
      return h ? stockRows.find((r) => r.houseId === h.id) ?? houseEligibility(h, stockAll, elements, stockSetbacks) : null;
    },
    [stockHouses, stockRows, houseId, stockAll, elements, stockSetbacks],
  );
  const stock = useMemo(() => stockRow?.eligible.map((e) => e.design) ?? [], [stockRow]);
  // other lots the plan on show also fits, to apply it to several at once
  const [alsoLots, setAlsoLots] = useState<string[]>([]);
  // lock the change through re-solves: a plan that cannot keep it is shown as a conflict
  const [lockHome, setLockHome] = useState(false);

  useEffect(() => {
    if (stockIndex >= stock.length) setStockIndex(0);
  }, [stock, stockIndex]);

  // Track by identity: a fit or lot change may re-sort the list.
  const index = Math.max(0, catalogue.findIndex(d => d.id === choiceId));
  const stepConcept = (delta: number) => {
    if (!catalogue.length) return;
    setChoiceId(catalogue[stepHomeDesignIndex(index, catalogue.length, delta)]!.id);
    setLevel(0);
    onCancelPreview?.();
  };

  const stepStock = (delta: number) => {
    if (!stock.length) return;
    setStockIndex((i) => stepHomeDesignIndex(i, stock.length, delta));
  };

  const step = (delta: number) => {
    if (mode === 'stock') stepStock(delta);
    else stepConcept(delta);
  };

  const browseLength = mode === 'stock' ? stock.length : catalogue.length;

  const plan = stock[Math.min(stockIndex, Math.max(stock.length - 1, 0))];
  const home = catalogue[Math.min(index, Math.max(catalogue.length - 1, 0))];
  const interiors = home ? interiorRenderings(home.id) : [];
  const views = ['Exterior', 'Plans', 'Elevations', ...(interiors.length ? ['Interiors'] as const : [])] as const;
  const shownView = view === 'Interiors' && !interiors.length ? 'Exterior' : view;
    const canShowPhotoreal = !!home && hasPhotorealElevation(home.id);
  const showPhotoreal = elevationMode === 'photo' && canShowPhotoreal;
  useEffect(() => {
    if (elevationMode === 'photo' && home && !hasPhotorealElevation(home.id)) setElevationMode('diagram');
  }, [elevationMode, home]);
  const row = rows[Math.min(index, Math.max(rows.length - 1, 0))];
  const current: FitResult | null = row?.result ?? null;
  const info = home ? program(home) : null;
  const [, , width, depth] = home ? designBounds(home) : [0, 0, 0, 0];


  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function keys(event: KeyboardEvent) {
      // docked beside the plan (wide screens), the studio answers keys only while focus is in it
      const docked = typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1000px)').matches;
      if (docked && root.current && !root.current.contains(event.target as Node)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        step(-1);
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        step(1);
        return;
      }
      if (event.key !== 'Tab' || !root.current) return;
      const list = Array.from(
        root.current.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),summary,[href]'),
      ).filter((e) => e.offsetParent !== null);
      const first = list[0],
        last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    window.addEventListener('keydown', keys, true);
    return () => {
      window.removeEventListener('keydown', keys, true);
      before?.focus();
    };
  }, [onClose, mode, browseLength]);

  return (
    <div
      className="home-studio-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal={typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1000px)').matches ? 'false' : 'true'}
        aria-label={TITLES[mode]}
        className="home-studio"
        ref={root}
      >
        <header>
          <div>
            <small>Parcel Proforma · Buildable plans{mode === 'mine' && projectName ? ` · ${projectName}` : ''}</small>
            <h2>{TITLES[mode]}</h2>
          </div>
          <div className="home-header-actions">
            <div
              className="home-browse"
              role="group"
              aria-label={mode === 'stock' ? 'Browse stock plans that fit this lot' : 'Browse designs, those that fit this lot first'}
            >
              <button type="button" onClick={() => step(-1)} disabled={browseLength < 2} aria-label="Previous design">
                ← Prev
              </button>
              <button type="button" onClick={() => step(1)} disabled={browseLength < 2} aria-label="Next design">
                Next →
              </button>
            </div>
            <button type="button" className="home-close" onClick={onClose} aria-label="Close home designs">
              Close ×
            </button>
          </div>
        </header>
        <div className="home-mode-tabs" role="tablist" aria-label="Home design source">
          <button type="button" role="tab" aria-selected={mode === 'mine'} data-testid="home-tab-mine" onClick={() => { setMode('mine'); setChoiceId(null); onCancelPreview?.(); }}>
            My plans{projectDesignIds.length ? ` · ${projectDesignIds.length}` : ''}
          </button>
          <button type="button" role="tab" aria-selected={mode === 'catalog'} data-testid="home-tab-catalog" onClick={() => { setMode('catalog'); setChoiceId(null); onCancelPreview?.(); }}>
            Authored catalog · {designs.length}
          </button>
          <button type="button" role="tab" aria-selected={mode === 'stock'} data-testid="home-tab-stock" onClick={() => { setMode('stock'); onCancelPreview?.(); }}>
            Stock plans
          </button>
        </div>
        {/* one target lot for every tab, shared with the plan's selection (handoff 11-27) */}
        {houses.length > 0 && (
          <div className="home-target-lot">
            <label>
              Target lot{' '}
              <select
                aria-label="Target house lot"
                data-testid="home-target-lot"
                value={houseId}
                onChange={(e) => {
                  setHouseId(e.target.value);
                  onTargetLot?.(e.target.value);
                  setStockIndex(0);
                  setChoiceId(null);
                  setCompatible(null);
                }}
              >
                {houses.map((h) => {
                  const r = stockRows.find((x) => x.houseId === h.id);
                  return (
                    <option key={h.id} value={h.id}>
                      {r?.lotLabel ?? parentLotOf(h, elements)?.name ?? h.name}
                    </option>
                  );
                })}
              </select>
            </label>
            {mode === 'stock' && selectedHouse && (
              <span className="home-target-count">{stock.length} stock plans fit this lot</span>
            )}
            {mode !== 'stock' && selectedHouse && (
              <span className="home-target-count" data-testid="home-target-fits">
                {fitsHere} of {rows.length} {mode === 'mine' ? 'project plans' : 'authored designs'} fit this lot
              </span>
            )}
          </div>
        )}
        {selectedHouse && (
          <div className="home-current" aria-label="Current home">
            <strong>Current home</strong>{' '}
            {typeof selectedHouse.properties.housingDesignId === 'string'
              ? <>
                  {HOME_DESIGNS.find(d => d.id === selectedHouse.properties.housingDesignId)?.name ?? selectedHouse.properties.housePlan ?? selectedHouse.name}
                  {' · '}{selectedHouse.properties.housingAssignmentSource === 'starter' ? 'suggested concept' :
                    HOME_DESIGNS.some(d => d.id === selectedHouse.properties.housingDesignId) ? 'concept study' : 'stock reference'}
                </>
              : <>{PROVISIONAL_PAD} · no home plan selected</>}
            {currentAuthored && (
              <button type="button" className="home-link" onClick={() => {
                onCancelPreview?.();
                setMode(projectDesignIds.includes(currentAuthored.id) ? 'mine' : 'catalog');
                setChoiceId(currentAuthored.id);
                setView('Plans');
                setLevel(0);
              }}>See current floor plans</button>
            )}
          </div>
        )}
        <div className="home-body">
          {mode === 'stock' ? (
            <>
              <nav aria-label="Buildable stock plans">
                {stock.length === 0 ? (
                  <p className="home-empty-eligible" data-testid="home-stock-none">
                    {stockAll.length === 0
                      ? 'No SF stock on this parcel.'
                      : stockRow?.lotProblem
                        ? `No stock plan can be placed on ${stockRow.lotLabel}: ${stockRow.lotProblem}.`
                        : stockRow
                          ? `None of the ${stockAll.length} stock plans fit ${stockRow.lotLabel}${stockRow.rejected[0] ? ` — for example ${stockRow.rejected[0].design.planNumber}: ${stockRow.rejected[0].reason}` : ''}.`
                          : 'Pick a house lot.'}
                  </p>
                ) : (
                  stock.map((h, i) => (
                    <button
                      type="button"
                      key={h.id}
                      aria-current={i === stockIndex ? 'true' : undefined}
                      onClick={() => setStockIndex(i)}
                    >
                      <strong>{h.planNumber}</strong>
                      <span>
                        {h.beds} bed · {bathsLabel(h.baths)} · {h.heatedSf.toLocaleString()} sf
                      </span>
                    </button>
                  ))
                )}
              </nav>
              <main>
                {plan ? (
                  <>
                    <div className="home-title">
                      <div>
                        <small>{plan.source.publisher}</small>
                        <h3>{plan.name}</h3>
                      </div>
                      <span>
                        {plan.beds} beds · {bathsLabel(plan.baths)}
                        <br />
                        {plan.heatedSf.toLocaleString()} sf heated
                      </span>
                    </div>
                    <div className="home-stock-card">
                      <p className="home-stock-kicker">{verificationLabel(plan.verification)}</p>
                      <dl className="home-stock-facts">
                        <div>
                          <dt>Listing overall</dt>
                          <dd>
                            {plan.footprint.widthFt}′ × {Number(plan.footprint.depthFt.toFixed(2))}′
                            <span className="home-stock-dim-note"> (may include porch)</span>
                          </dd>
                        </div>
                        <div>
                          <dt>Stories</dt>
                          <dd>{plan.stories}</dd>
                        </div>
                        <div>
                          <dt>Parking</dt>
                          <dd>{parkingLabel(plan.parking)}</dd>
                        </div>
                        <div>
                          <dt>Porch face</dt>
                          <dd>{plan.porchFace}</dd>
                        </div>
                      </dl>
                      <p>{plan.source.citation}</p>
                      {plan.source.url && (
                        <p>
                          <a href={plan.source.url} target="_blank" rel="noreferrer">
                            View publisher listing →
                          </a>
                        </p>
                      )}
                      {plan.notes[0] && <p className="home-stock-note">{plan.notes[0]}</p>}
                    </div>
                    <StockDrawings plan={plan} />
                    <section className="home-placement">
                      <h4>Apply on this site</h4>
                      {stockRow && onApplyStock ? (
                        <>
                          <div>
                            <button
                              type="button"
                              className="home-primary"
                              data-testid="home-stock-apply"
                              onClick={() => {
                                onApplyStock(plan.id, stockRow.houseId, lockHome);
                                onClose();
                              }}
                            >
                              Change home on {stockRow.lotLabel}
                            </button>
                          </div>
                          {onApplyStockMany && (() => {
                            const others = stockRows.filter((r) => r.houseId !== stockRow.houseId && r.eligible.some((e) => e.design.id === plan.id));
                            if (!others.length) return null;
                            const chosen = alsoLots.filter((h) => others.some((o) => o.houseId === h));
                            return (
                              <fieldset className="home-also" data-testid="home-stock-also">
                                <legend>Also fits — apply to these lots too</legend>
                                {others.map((o) => (
                                  <label key={o.houseId}>
                                    <input
                                      type="checkbox"
                                      checked={chosen.includes(o.houseId)}
                                      onChange={(e) => setAlsoLots((cur) => (e.target.checked ? [...cur, o.houseId] : cur.filter((h) => h !== o.houseId)))}
                                    />{' '}
                                    {o.lotLabel}
                                  </label>
                                ))}
                                {chosen.length > 0 && (
                                  <button
                                    type="button"
                                    data-testid="home-stock-apply-many"
                                    onClick={() => {
                                      onApplyStockMany(plan.id, [stockRow.houseId, ...chosen]);
                                      setAlsoLots([]);
                                      onClose();
                                    }}
                                  >
                                    Apply to {chosen.length + 1} lots
                                  </button>
                                )}
                              </fieldset>
                            );
                          })()}
                          <label className="home-lock" data-testid="home-stock-lock">
                            <input type="checkbox" checked={lockHome} onChange={(e) => setLockHome(e.target.checked)} /> Lock this home through
                            re-solves (a new plan that cannot keep it asks before replacing it)
                          </label>
                          <p data-testid="home-stock-fit">
                            {stockRow.eligible.find((e) => e.design.id === plan.id)?.fit.reason ?? ''}. Only this
                            lot changes: its pad takes this plan’s listing-overall footprint in the placed
                            position; the other houses keep their plans. Construction drawings are licensed
                            from the publisher separately.
                          </p>
                          <p className="home-fit-hint">
                            Showing the {stock.length} plan{stock.length === 1 ? '' : 's'} that fit {stockRow.lotLabel}
                            {' '}of {stockAll.length}. Use ← → to browse without losing the lot.
                          </p>
                        </>
                      ) : houses.length ? (
                        <p>
                          Open this parcel’s by-right house design picker to apply the plan, or return after
                          house lots are drawn.
                        </p>
                      ) : (
                        <p>This scheme has no detached or attached house footprint to check.</p>
                      )}
                    </section>
                    <footer>
                      Citation-only catalogue facts from America’s Best House Plans. This app does not ship
                      copyrighted elevations or construction PDFs.
                    </footer>
                  </>
                ) : (
                  <p role="status">
                    {stockPlans !== undefined && stockPlans.length === 0
                      ? 'No SF stock on this parcel — apply is limited to single-family / by-right detached sessions (or a labeled rezone).'
                      : stockRow
                        ? `No stock plans fit ${stockRow.lotLabel}. Switch lots above, or close and adjust the scheme.`
                        : 'No buildable stock plans are loaded.'}
                  </p>
                )}
              </main>
            </>
          ) : (
            <>
              <nav aria-label={mode === 'mine' ? 'Project plans' : 'Authored designs'}>
                {emptyEligible ? (
                  <p className="home-empty-eligible" data-testid="home-mine-empty">
                    {mode === 'mine' ? 'No project plans linked to this parcel.' : 'No authored designs in the catalogue.'}
                  </p>
                ) : (
                  rows.map((r, i) => (
                    <button
                      type="button"
                      key={r.design.id}
                      data-testid={`home-design-${r.design.id}`}
                      data-fit={r.status}
                      aria-current={i === index ? 'true' : undefined}
                      onClick={() => {
                        setChoiceId(r.design.id);
                        onCancelPreview?.();
                        setLevel(0);
                        setCompatible(null);
                      }}
                    >
                      <strong>{r.design.name}</strong>
                      <span>{r.design.setting}</span>
                      <span className={`home-fit-badge home-fit-${r.status}`}>{r.badge}</span>
                    </button>
                  ))
                )}
              </nav>
              <main>
                {emptyEligible ? (
                  <div role="status" className="home-mine-none">
                    <p>
                      {mode === 'mine'
                        ? 'This parcel has no project plans linked. A project\'s own designs appear here once its parent and phase parcels are mapped to it.'
                        : 'The authored catalogue is empty.'}
                    </p>
                    {mode === 'mine' && (
                      <p>
                        <button type="button" className="home-primary" onClick={() => { setMode('catalog'); setChoiceId(null); onCancelPreview?.(); }}>Browse the authored catalog</button>{' '}
                        <button type="button" onClick={() => { setMode('stock'); onCancelPreview?.(); }}>Stock plans</button>
                      </p>
                    )}
                  </div>
                ) : home && info ? (
                  <>
                    <div className="home-title">
                      <div>
                        <small data-testid="home-design-source">{home.setting} · {SOURCE_LABEL[authoredSource(home.id)]}</small>
                        <h3>{home.name}</h3>
                      </div>
                      <span>
                        {info.beds} beds · {info.baths} baths
                        <br />
                        {Math.round(info.heated).toLocaleString()} sf conditioned*
                      </span>
                    </div>
                    <div className="home-tabs">
                      {views.map((v) => (
                        <button key={v} type="button" aria-pressed={v === shownView} onClick={() => setView(v)}>
                          {v}
                        </button>
                      ))}
                    </div>
                    {shownView === 'Interiors' ? (
                      <div>
                        <p className="home-exterior-note">
                          {home.id.startsWith('tn-west-heiman-') && 'Level 2 is 19′-9¼″ across the outside walls. Clear room widths are smaller. '}
                          These are illustrative studies, not dimensional or construction drawings.
                        </p>
                        {interiors.map(({ name, src }) => (
                          <figure key={src}>
                            <img src={src} alt={home.name + ', illustrative ' + name.toLowerCase()} loading="lazy" />
                            <figcaption className="home-exterior-note">{name} · photoreal character study</figcaption>
                          </figure>
                        ))}
                      </div>
                    ) : shownView === 'Exterior' ? (
                      <figure>
                        <img
                          src={exteriorRendering(home.id)}
                          alt={home.name + ', illustrative character exterior (not generated from this plan)'}
                        />
                        <figcaption className="home-exterior-note">
                          Illustrative character image — not generated from this plan’s drawings, and not a
                          photo of a built home.
                        </figcaption>
                      </figure>
                    ) : shownView === 'Plans' ? (
                      <>
                        <div className="home-options">
                          {home.levels.map((l, i) => (
                            <button
                              key={l.name}
                              type="button"
                              aria-pressed={level === i}
                              onClick={() => setLevel(i)}
                            >
                              {l.name}
                            </button>
                          ))}
                        </div>
                        <figure className="home-plan">
                          <HomePlan home={home} level={level} />
                        </figure>
                        <details>
                          <summary>Room dimensions</summary>
                          <dl className="home-rooms">
                            {home.levels[level]!.rooms.map((r) => (
                              <div key={r.name}>
                                <dt>{r.name}</dt>
                                <dd>
                                  {ft2(r.rect[2])} × {ft2(r.rect[3])} ft
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      </>
                    ) : (
                      <>
                        <div className="home-options" role="group" aria-label="Elevation face">
                          {(['front', 'right', 'back', 'left'] as const).map((v) => (
                            <button type="button" key={v} aria-pressed={v === side} onClick={() => setSide(v)}>
                              {v === 'back' ? 'Rear' : v[0]!.toUpperCase() + v.slice(1)}
                            </button>
                          ))}
                        </div>
                        <div className="home-options" role="group" aria-label="Elevation presentation">
                          <button
                            type="button"
                            aria-pressed={!showPhotoreal}
                            onClick={() => setElevationMode('diagram')}
                          >
                            Diagram
                          </button>
                          {canShowPhotoreal ? (
                            <button
                              type="button"
                              aria-pressed={showPhotoreal}
                              onClick={() => setElevationMode('photo')}
                              data-testid="home-elevation-photoreal"
                            >
                              Photoreal
                            </button>
                          ) : null}
                        </div>
                        {showPhotoreal ? (
                          <figure data-testid="home-elevation-photo">
                            <img
                              src={photorealElevationSrc(home.id, side)}
                              alt={
                                home.name +
                                ', illustrative character ' +
                                (side === 'back' ? 'rear' : side) +
                                ' elevation (not generated from this plan)'
                              }
                              onError={() => setElevationMode('diagram')}
                            />
                            <figcaption className="home-exterior-note">
                              Illustrative character elevation — not generated from this plan’s drawings, not a
                              licensed stock photo, and not a photo of a built home.
                            </figcaption>
                          </figure>
                        ) : (
                          <figure className="home-elevation" data-testid="home-elevation-diagram">
                            <Elevation home={home} side={side} />
                            <figcaption className="home-exterior-note">
                              Schematic diagram from plan volumes — not a construction elevation.
                            </figcaption>
                          </figure>
                        )}
                      </>
                    )}
                    <p>{home.description}</p>
                    <p>{home.access}</p>
                    <div className="home-measures">
                      <span>
                        {ft2(width)} × {ft2(depth)} ft incl. porches
                      </span>
                      <span>
                        {home.levels.length} {home.levels.length === 1 ? 'story' : 'stories'}
                      </span>
                      <span>{roofHeight(home).toFixed(1)} ft to ridge or parapet</span>
                    </div>
                    <section className="home-placement">
                      <h4>Place on a house lot</h4>
                      {houses.length ? (
                        <>
                          <div>
                            <span className="home-target-name" data-testid="home-concept-target">{selectedHouse ? `On ${targetLabel}` : 'Choose a target lot above'}</span>
                            {current?.placement && onApplyConcept && selectedHouse && home && (
                              <button
                                type="button"
                                className="home-primary"
                                data-testid="home-concept-apply"
                                onClick={() => {
                                  onApplyConcept(home.id, selectedHouse.id);
                                }}
                              >
                                Apply to {targetLabel ?? 'this lot'}
                              </button>
                            )}
                            {preview?.house === selectedHouse?.id && onCancelPreview && (
                              <button type="button" onClick={onCancelPreview}>Cancel preview</button>
                            )}
                            {current?.placement && (
                              <button
                                type="button"
                                className={onApplyConcept ? undefined : 'home-primary'}
                                aria-pressed={preview?.house === current.placement.house && preview.name === current.placement.name}
                                onClick={() => onPreview(current.placement!)}
                              >
                                Preview on site
                              </button>
                            )}
                          </div>
                          <p aria-live="polite" data-testid="home-concept-reason" data-fit={row?.status ?? ''}>
                            {current?.placement?.basis ??
                              (current?.reason ? `Does not fit: ${current.reason}.` : 'Choose a target lot to check the fit. Preview compares the candidate on the current site view.')}
                          </p>
                          {home && row && row.status !== 'fits' && row.status !== 'no-lot' && (
                            <div className="home-compatible">
                              <button
                                type="button"
                                data-testid="home-find-compatible"
                                onClick={() => setCompatible({ designId: home.id, lots: compatibleLots(home, houses, elements, siteBoundary, maxHeightFt).map((h) => ({ id: h.id, name: stockRows.find((r) => r.houseId === h.id)?.lotLabel ?? h.name })) })}
                              >
                                Find compatible lots
                              </button>
                              {compatible?.designId === home.id && (
                                compatible.lots.length ? (
                                  <span data-testid="home-compatible-lots">
                                    Fits on:{' '}
                                    {compatible.lots.map((l) => (
                                      <button key={l.id} type="button" className="home-link" onClick={() => { setHouseId(l.id); onTargetLot?.(l.id); setCompatible(null); }}>{l.name}</button>
                                    ))}
                                  </span>
                                ) : (
                                  <span data-testid="home-compatible-lots">No lot on this plan takes it.</span>
                                )
                              )}
                            </div>
                          )}
                          <p className="home-fit-hint">
                            {fitsHere} of {rows.length} design{rows.length === 1 ? '' : 's'} fit
                            {selectedHouse ? ` ${stockRows.find((r) => r.houseId === selectedHouse.id)?.lotLabel ?? `“${selectedHouse.name}”`}` : ' this scheme'}; the others are listed with their reason. Use ← → to browse
                            without losing the lot.
                          </p>
                        </>
                      ) : (
                        <p>This scheme has no detached or attached house footprint to check.</p>
                      )}
                    </section>
                    <footer>
                      * Approximate conditioned area from schematic room zones (kitchen, baths, HVAC/mech, laundry —
                      not numbered placeholders). Dimensions include wall allowances. Exterior and elevation images are
                      illustrative AI character studies — not licensed stock, not construction photos, and not derived
                      from plan CAD. These are concept studies for site fit — not publisher construction sets or
                      dimensioned project plans. For cited stock plans (e.g. America’s Best House Plans), use the Stock plans tab.
                    </footer>
                  </>
                ) : null}
              </main>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
