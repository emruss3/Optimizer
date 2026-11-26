import { useEffect, useMemo, useRef, useState } from 'react';
import type { Element } from '../../../engine/types';
import { HOME_DESIGNS, type Face, type HomeDesign } from './originalDesigns';
import { designBounds, program, roofHeight } from './drawings';
import { hasPhotorealElevation, photorealElevationSrc } from './elevationAssets';
import { HomePlan, Elevation } from './PlanIllustrations';
import { placeHome, residentialHomes, type FitResult, type HomePlacement } from './placement';
import { buildableStockPlans } from './catalogue';
import { designsFittingHouse, stepHomeDesignIndex } from './homeDesignsGate';
import { withoutHomeParts } from './carry';
import { DEFAULT_HOME_SETBACKS, detachedHouses, houseEligibility, stockEligibility, type HouseLotEligibility } from './eligibility';
import type { HousingDesignRecord } from './types';
import './homeStudio.css';

type StudioMode = 'stock' | 'concept';

interface Props {
  siteBoundary?: Element['geometry'] | null;
  elements: Element[];
  selected?: string | null;
  /** Scheme-eligible concept studies (#194). Defaults to the full concept catalogue. */
  designs?: readonly HomeDesign[];
  /** Buildable publisher stock plans (defaults to the ABHP citation catalogue). */
  stockPlans?: readonly HousingDesignRecord[];
  /** The workspace's eligibility rows for these elements (computed once there); recomputed when absent. */
  stockEligibilityRows?: HouseLotEligibility[];
  /** Setbacks the fit uses (the zoning brief's); a lot's own engine setbacks win. */
  stockSetbacks?: { front: number; side: number; rear: number };
  /** Change the home on one house's lot to this stock plan. */
  onApplyStock?: (designId: string, houseId: string) => void;
  /** Apply one stock plan to several lots as one change. */
  onApplyStockMany?: (designId: string, houseIds: string[]) => void;
  /** Commit a concept study on one house's lot (not a preview: it becomes the plan). */
  onApplyConcept?: (designId: string, houseId: string) => void;
  onClose: () => void;
  onPreview: (placement: HomePlacement) => void;
}

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
  siteBoundary,
  designs = HOME_DESIGNS,
  stockPlans,
  stockSetbacks = DEFAULT_HOME_SETBACKS,
  stockEligibilityRows,
  onApplyStock,
  onApplyStockMany,
  onApplyConcept,
}: Props) {
  // Explicit empty list means “no SF stock for this session” (MF/CS) — do not
  // fall back to the full catalogue and offer Apply on apartment land.
  const stockAll = useMemo(
    () => (stockPlans !== undefined ? [...stockPlans] : buildableStockPlans()),
    [stockPlans],
  );
  const houses = useMemo(() => residentialHomes(elements), [elements]);
  const [mode, setMode] = useState<StudioMode>('stock');
  const [stockIndex, setStockIndex] = useState(0);
  const [index, setIndex] = useState(0),
    [level, setLevel] = useState(0),
    [view, setView] = useState<'Exterior' | 'Plans' | 'Elevations'>('Exterior');
  const [side, setSide] = useState<Face>('front'),
    // Diagram is the plan-derived default; Photoreal is an opt-in character view.
    [elevationMode, setElevationMode] = useState<'photo' | 'diagram'>('diagram'),
    [houseId, setHouseId] = useState(() => houses.find((e) => e.id === selected)?.id ?? houses[0]?.id ?? '');
  const [fit, setFit] = useState<{ key: string; result: FitResult } | null>(null),
    root = useRef<HTMLElement>(null);

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

  // A house that already carries a committed concept is fitted again on the plan without that
  // concept's porch, walk and pad (they would collide with the new design's own).
  const conceptBase = useMemo(
    () => (selectedHouse ? withoutHomeParts(elements, selectedHouse.id) : elements),
    [elements, selectedHouse],
  );
  // Fit-first: when a lot is selected, only offer concept designs that place on that lot.
  const catalogue = useMemo(() => {
    if (!designs.length) return [] as HomeDesign[];
    if (!selectedHouse) return [...designs];
    return designsFittingHouse(designs, selectedHouse, conceptBase, siteBoundary);
  }, [designs, selectedHouse, conceptBase, siteBoundary]);
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

  useEffect(() => {
    if (stockIndex >= stock.length) setStockIndex(0);
  }, [stock, stockIndex]);

  useEffect(() => {
    if (catalogue.length && index >= catalogue.length) setIndex(0);
  }, [catalogue, index]);

  const stepConcept = (delta: number) => {
    if (!catalogue.length) return;
    setIndex((i) => stepHomeDesignIndex(i, catalogue.length, delta));
    setLevel(0);
    setFit(null);
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
  const key = (home?.id ?? '') + '|' + houseId;
  const canShowPhotoreal = !!home && hasPhotorealElevation(home.id);
  const showPhotoreal = elevationMode === 'photo' && canShowPhotoreal;
  useEffect(() => {
    if (elevationMode === 'photo' && home && !hasPhotorealElevation(home.id)) setElevationMode('diagram');
  }, [elevationMode, home]);
  const current = fit?.key === key ? fit.result : null;
  const info = home ? program(home) : null;
  const [, , width, depth] = home ? designBounds(home) : [0, 0, 0, 0];

  // Auto-check fit when the concept design or lot changes so Preview is one click away.
  useEffect(() => {
    if (mode !== 'concept' || !home || !selectedHouse) {
      if (mode !== 'concept') return;
      setFit(null);
      return;
    }
    setFit({ key, result: placeHome(home, selectedHouse, conceptBase, siteBoundary) });
  }, [mode, key, home, selectedHouse, conceptBase, siteBoundary]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function keys(event: KeyboardEvent) {
      // docked beside the plan (wide screens), the studio answers keys only while focus is in it
      const docked = typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1280px)').matches;
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
        aria-modal={typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1280px)').matches ? 'false' : 'true'}
        aria-label={mode === 'stock' ? 'Buildable stock plans' : 'Concept home studies'}
        className="home-studio"
        ref={root}
      >
        <header>
          <div>
            <small>Parcel Proforma{mode === 'concept' ? ' · concept studies' : ''}</small>
            <h2>{mode === 'stock' ? 'Buildable stock plans' : 'Concept studies'}</h2>
          </div>
          <div className="home-header-actions">
            <div
              className="home-browse"
              role="group"
              aria-label={mode === 'stock' ? 'Browse stock plans that fit this lot' : 'Browse designs that fit this lot'}
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
          <button type="button" role="tab" aria-selected={mode === 'stock'} onClick={() => setMode('stock')}>
            Buildable stock
          </button>
          <button type="button" role="tab" aria-selected={mode === 'concept'} onClick={() => setMode('concept')}>
            Concept studies
          </button>
        </div>
        <div className="home-body">
          {mode === 'stock' ? (
            <>
              <nav aria-label="Buildable stock plans">
                {stockHouses.length > 0 && (
                  <div className="home-stock-lot">
                    <label>
                      Lot{' '}
                      <select
                        aria-label="House lot to change"
                        data-testid="home-stock-lot"
                        value={houseId}
                        onChange={(e) => {
                          setHouseId(e.target.value);
                          setStockIndex(0);
                        }}
                      >
                        {stockRows.map((r) => (
                          <option key={r.houseId} value={r.houseId}>
                            {r.lotLabel} · {r.eligible.length} plan{r.eligible.length === 1 ? '' : 's'} fit
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
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
                                onApplyStock(plan.id, stockRow.houseId);
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
              <nav aria-label="Home designs that fit">
                {houses.length > 0 && (
                  <div className="home-stock-lot">
                    <label>
                      Lot filter{' '}
                      <select
                        aria-label="House lot to filter concept studies"
                        value={houseId}
                        onChange={(e) => {
                          setHouseId(e.target.value);
                          setIndex(0);
                          setFit(null);
                        }}
                      >
                        {houses.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {emptyEligible ? (
                  <p className="home-empty-eligible">
                    {selectedHouse
                      ? 'No designs fit this selected lot. Pick another house lot, or return to the base plan.'
                      : 'No concept studies fit this house lot.'}
                  </p>
                ) : (
                  catalogue.map((h, i) => (
                    <button
                      type="button"
                      key={h.id}
                      aria-current={i === index ? 'true' : undefined}
                      onClick={() => {
                        setIndex(i);
                        setLevel(0);
                        setFit(null);
                      }}
                    >
                      <strong>{h.name}</strong>
                      <span>{h.setting}</span>
                    </button>
                  ))
                )}
              </nav>
              <main>
                {emptyEligible ? (
                  <p role="status">
                    {selectedHouse
                      ? `“${selectedHouse.name}” cannot take any of the eligible Middle Tennessee concept designs at full size with the drawn approaches. Switch lots above, or close and adjust the scheme.`
                      : 'This layout has detached or attached house footprints, but none of the concept designs clear the drawn lots, setbacks, and mapped approaches.'}
                  </p>
                ) : home && info ? (
                  <>
                    <div className="home-title">
                      <div>
                        <small>{home.setting} · concept study</small>
                        <h3>{home.name}</h3>
                      </div>
                      <span>
                        {info.beds} beds · {info.baths} baths
                        <br />
                        {info.heated.toLocaleString()} sf conditioned*
                      </span>
                    </div>
                    <div className="home-tabs">
                      {(['Exterior', 'Plans', 'Elevations'] as const).map((v) => (
                        <button key={v} type="button" aria-pressed={v === view} onClick={() => setView(v)}>
                          {v}
                        </button>
                      ))}
                    </div>
                    {view === 'Exterior' ? (
                      <figure>
                        <img
                          src={'/home-designs/' + home.id + '.webp'}
                          alt={home.name + ', illustrative character exterior (not generated from this plan)'}
                        />
                        <figcaption className="home-exterior-note">
                          Illustrative character image — not generated from this plan’s drawings, and not a
                          photo of a built home.
                        </figcaption>
                      </figure>
                    ) : view === 'Plans' ? (
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
                                  {r.rect[2]} × {r.rect[3]} ft
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
                        {width} × {depth} ft incl. porches
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
                            <select
                              aria-label="House lot to place on"
                              value={houseId}
                              onChange={(e) => {
                                setHouseId(e.target.value);
                                setIndex(0);
                                setFit(null);
                              }}
                            >
                              {houses.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name}
                                </option>
                              ))}
                            </select>
                            {current?.placement && onApplyConcept && selectedHouse && home && (
                              <button
                                type="button"
                                className="home-primary"
                                data-testid="home-concept-apply"
                                onClick={() => {
                                  onApplyConcept(home.id, selectedHouse.id);
                                  onClose();
                                }}
                              >
                                Apply to this lot
                              </button>
                            )}
                            {current?.placement && (
                              <button
                                type="button"
                                className={onApplyConcept ? undefined : 'home-primary'}
                                onClick={() => onPreview(current.placement!)}
                              >
                                Preview in 3D massing
                              </button>
                            )}
                          </div>
                          <p aria-live="polite">
                            {current?.placement?.basis ??
                              current?.reason ??
                              'Selecting a lot lists only designs that fit it. Preview opens live 3D massing on that house.'}
                          </p>
                          <p className="home-fit-hint">
                            Showing {catalogue.length} design{catalogue.length === 1 ? '' : 's'} that fit
                            {selectedHouse ? ` “${selectedHouse.name}”` : ' this scheme'}. Use ← → to browse
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
                      from plan CAD. These are concept studies for site fit — not publisher construction sets. For cited
                      buildable stock plans (e.g. America’s Best House Plans), use the Buildable stock tab.
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
